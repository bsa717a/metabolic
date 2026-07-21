import { MealItemType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getAiProvider, MockAiProvider, type EnrichedShoppingListResult, type ShoppingListInputItem } from './aiService.js';
import { parseValidatedDateRange, toDateKey } from '../utils/dates.js';
import { consolidateShoppingListItems, formatGroceryDescription } from '../utils/groceryConversion.js';
import { n, round } from '../utils/numbers.js';

export type GroceryListItem = {
  id: string;
  plannedName: string;
  plannedQuantity: number;
  plannedUnit: string;
  occurrenceCount: number;
  groceryDescription: string;
  groceryCategory: string;
  storeLocation: string | null;
  notes: string | null;
};

export type GroceryListSection = {
  title: string;
  items: GroceryListItem[];
};

export type ShoppingListResult = {
  startDate: string;
  endDate: string;
  plannedDayCount: number;
  itemCount: number;
  storeName: string | null;
  intro: string | null;
  enriched: boolean;
  sections: GroceryListSection[];
  note: string;
};

const BASE_NOTE =
  'Same foods with convertible units (for example eggs counted individually and by the dozen) are combined into one line.';
const ENRICHED_NOTE =
  'Grocery amounts are estimated typical US store packages. Adjust based on what you already have at home.';
const STORE_NOTE = ' Aisle and section hints are approximate and can vary by store location.';

function groupGroceryItems(items: GroceryListItem[], storeName: string | null): GroceryListSection[] {
  const useStoreLocations = Boolean(storeName?.trim()) && items.some((item) => item.storeLocation);
  const grouped = new Map<string, GroceryListItem[]>();

  for (const item of items) {
    const title = useStoreLocations ? item.storeLocation || 'Other' : item.groceryCategory || 'Other';
    const sectionItems = grouped.get(title) ?? [];
    sectionItems.push(item);
    grouped.set(title, sectionItems);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    .map(([title, sectionItems]) => ({
      title,
      items: sectionItems.sort((a, b) => a.plannedName.localeCompare(b.plannedName, undefined, { sensitivity: 'base' }))
    }));
}

/** Exported for tests — AI supplies aisle/category only; buy amounts stay deterministic. */
export function mergeEnrichment(inputItems: ShoppingListInputItem[], enriched: EnrichedShoppingListResult): GroceryListItem[] {
  const byId = new Map(enriched.items.map((item) => [item.id, item]));

  return inputItems.map((item) => {
    const match = byId.get(item.id);

    return {
      id: item.id,
      plannedName: item.name,
      plannedQuantity: item.quantity,
      plannedUnit: item.unit,
      occurrenceCount: item.occurrenceCount,
      groceryDescription: formatGroceryDescription(item.name, item.quantity, item.unit),
      groceryCategory: match?.groceryCategory ?? 'Other',
      storeLocation: match?.storeLocation ?? null,
      notes: match?.notes ?? null
    };
  });
}

async function aggregatePlannedItems(userId: string, startDate: string, endDate: string) {
  const { start, end } = parseValidatedDateRange(startDate, endDate);

  const plannedItems = await prisma.mealItem.findMany({
    where: {
      type: MealItemType.PLANNED,
      meal: {
        userId,
        dailyLog: {
          date: { gte: start, lte: end }
        }
      }
    },
    select: {
      nameSnapshot: true,
      quantity: true,
      unit: true,
      meal: {
        select: {
          dailyLogId: true
        }
      }
    }
  });

  const aggregates = new Map<string, ShoppingListInputItem>();
  const plannedLogIds = new Set<string>();

  for (const item of plannedItems) {
    plannedLogIds.add(item.meal.dailyLogId);
    const name = item.nameSnapshot.trim();
    const unit = item.unit.trim() || 'serving';
    const key = `${name}\0${unit}`;
    const existing = aggregates.get(key);
    const quantity = n(item.quantity);

    if (existing) {
      existing.quantity = round(existing.quantity + quantity, 2);
      existing.occurrenceCount += 1;
      continue;
    }

    aggregates.set(key, {
      id: '',
      name,
      quantity: round(quantity, 2),
      unit,
      occurrenceCount: 1
    });
  }

  const inputItems = consolidateShoppingListItems(
    [...aggregates.values()].map((item, index) => ({ ...item, id: String(index) }))
  );

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    plannedDayCount: plannedLogIds.size,
    inputItems
  };
}

export async function getGroceryShoppingList(
  userId: string,
  startDate: string,
  endDate: string,
  storeName?: string | null
): Promise<ShoppingListResult> {
  const trimmedStore = storeName?.trim() || null;
  const { startDate: resolvedStart, endDate: resolvedEnd, plannedDayCount, inputItems } = await aggregatePlannedItems(
    userId,
    startDate,
    endDate
  );

  if (!inputItems.length) {
    return {
      startDate: resolvedStart,
      endDate: resolvedEnd,
      plannedDayCount,
      itemCount: 0,
      storeName: trimmedStore,
      intro: null,
      enriched: false,
      sections: [],
      note: BASE_NOTE
    };
  }

  let enriched;
  let enrichedFlag = true;
  try {
    enriched = await getAiProvider().enrichShoppingList(inputItems, trimmedStore);
  } catch {
    enriched = await new MockAiProvider().enrichShoppingList(inputItems, trimmedStore);
    enrichedFlag = false;
  }

  const groceryItems = mergeEnrichment(inputItems, enriched);
  const note = enrichedFlag
    ? `${ENRICHED_NOTE}${trimmedStore ? STORE_NOTE : ''}`
    : `${ENRICHED_NOTE} Could not reach AI; showing estimated grocery amounts instead.${trimmedStore ? STORE_NOTE : ''}`;

  return {
    startDate: resolvedStart,
    endDate: resolvedEnd,
    plannedDayCount,
    itemCount: groceryItems.length,
    storeName: trimmedStore,
    intro: enriched.intro,
    enriched: enrichedFlag,
    sections: groupGroceryItems(groceryItems, trimmedStore),
    note
  };
}

// Keep raw aggregation available for future export/print flows.
export async function getShoppingList(userId: string, startDate: string, endDate: string) {
  const { startDate: resolvedStart, endDate: resolvedEnd, plannedDayCount, inputItems } = await aggregatePlannedItems(
    userId,
    startDate,
    endDate
  );

  return {
    startDate: resolvedStart,
    endDate: resolvedEnd,
    plannedDayCount,
    itemCount: inputItems.length,
    items: inputItems
  };
}
