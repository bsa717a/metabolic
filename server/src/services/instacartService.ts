import { z } from 'zod';
import { env } from '../config/env.js';
import { buildInstacartMeasurement } from '../utils/instacartUnits.js';
import { getGroceryShoppingList, type GroceryListItem } from './shoppingListService.js';

const productsLinkResponseSchema = z.object({
  products_link_url: z.string().url()
});

export type InstacartShoppingListLinkResult = {
  url: string;
  itemCount: number;
  expiresInDays: number;
};

export function isInstacartConfigured() {
  return Boolean(env.INSTACART_API_KEY.trim());
}

function instacartApiBase() {
  if (env.INSTACART_API_BASE.trim()) {
    return env.INSTACART_API_BASE.trim().replace(/\/$/, '');
  }

  return env.NODE_ENV === 'production' ? 'https://connect.instacart.com' : 'https://connect.dev.instacart.tools';
}

function flattenGroceryItems(sections: { items: GroceryListItem[] }[]) {
  return sections.flatMap((section) => section.items);
}

function toInstacartLineItem(item: GroceryListItem) {
  const measurement = buildInstacartMeasurement({
    groceryDescription: item.groceryDescription,
    plannedQuantity: item.plannedQuantity,
    plannedUnit: item.plannedUnit
  });

  return {
    name: item.groceryDescription.trim(),
    display_text: item.groceryDescription.trim(),
    line_item_measurements: [measurement]
  };
}

function formatListTitle(startDate: string, endDate: string) {
  if (startDate === endDate) return `Metabolic meal plan · ${startDate}`;
  return `Metabolic meal plan · ${startDate} to ${endDate}`;
}

export async function createInstacartShoppingListLink(options: {
  userId: string;
  startDate: string;
  endDate: string;
  storeName?: string | null;
  title?: string | null;
  expiresInDays?: number;
}): Promise<InstacartShoppingListLinkResult> {
  if (!isInstacartConfigured()) {
    throw new Error('Instacart ordering is not configured.');
  }

  const expiresInDays = options.expiresInDays ?? 7;
  if (expiresInDays < 1 || expiresInDays > 365) {
    throw new Error('Link expiry must be between 1 and 365 days.');
  }

  const shoppingList = await getGroceryShoppingList(
    options.userId,
    options.startDate,
    options.endDate,
    options.storeName ?? null
  );

  const groceryItems = flattenGroceryItems(shoppingList.sections);
  if (!groceryItems.length) {
    throw new Error('Add planned foods to your meals before ordering groceries.');
  }

  const payload = {
    title: options.title?.trim() || formatListTitle(shoppingList.startDate, shoppingList.endDate),
    link_type: 'shopping_list',
    expires_in: expiresInDays,
    line_items: groceryItems.map(toInstacartLineItem),
    landing_page_configuration: {
      partner_linkback_url: `${env.CLIENT_URL.replace(/\/$/, '')}/nutrition`
    }
  };

  const response = await fetch(`${instacartApiBase()}/idp/v1/products/products_link`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.INSTACART_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  let bodyJson: unknown = null;
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
  }

  if (!response.ok) {
    const message =
      typeof bodyJson === 'object' &&
      bodyJson !== null &&
      'error' in bodyJson &&
      typeof (bodyJson as { error?: unknown }).error === 'string'
        ? (bodyJson as { error: string }).error
        : typeof bodyJson === 'object' &&
            bodyJson !== null &&
            'message' in bodyJson &&
            typeof (bodyJson as { message?: unknown }).message === 'string'
          ? (bodyJson as { message: string }).message
          : `Instacart request failed (${response.status}).`;

    if (response.status === 401 || response.status === 403) {
      throw new Error('Instacart API key is invalid or not authorized.');
    }

    throw new Error(message);
  }

  const parsed = productsLinkResponseSchema.safeParse(bodyJson);
  if (!parsed.success) {
    throw new Error('Instacart returned an unexpected response.');
  }

  return {
    url: parsed.data.products_link_url,
    itemCount: groceryItems.length,
    expiresInDays
  };
}
