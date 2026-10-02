import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { MasterPlanDocument, MasterPlanWeekPage, MealSlotSection } from './masterPlanPdfModel';

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN_X = 28;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const NAVY = rgb(0.122, 0.161, 0.2);
const GREEN = rgb(0.49, 0.639, 0.365);
const GOLD = rgb(0.886, 0.761, 0.431);
const RULE = rgb(0.75, 0.78, 0.8);
const MUTED = rgb(0.38, 0.41, 0.45);
const HEADER_BG = rgb(0.945, 0.953, 0.957);
const ROW_ALT = rgb(0.976, 0.98, 0.984);
const WHITE = rgb(1, 1, 1);

const TRACKER_COLUMNS = [
  { key: 'day', label: 'Day', width: 46 },
  { key: 'exercise', label: 'Exercise', width: 72 },
  { key: 'meal1', label: 'Meal 1', width: 58 },
  { key: 'meal2', label: 'Meal 2', width: 58 },
  { key: 'meal3', label: 'Meal 3', width: 58 },
  { key: 'meal4', label: 'Meal 4', width: 58 },
  { key: 'water', label: 'Water oz', width: 62 },
  { key: 'sleep', label: 'Sleep', width: 48 },
  { key: 'notes', label: 'Notes', width: CONTENT_WIDTH - (46 + 72 + 58 * 4 + 62 + 48) }
] as const;

export function sanitizePdfText(value: string) {
  return value
    .replace(/\u00d7/g, 'x')
    .replace(/\u00b7/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '');
}

export async function buildMasterPlanPdf(
  doc: MasterPlanDocument,
  options: { logoPng?: Uint8Array | null } = {}
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.clientName}'s Master Metabolic Plan`);
  pdf.setAuthor('Master Metabolic');
  pdf.setCreator('Master Metabolic');
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = options.logoPng?.byteLength ? await pdf.embedPng(options.logoPng) : null;

  const weeks = doc.weeks.length ? doc.weeks : [emptyWeek(doc)];
  for (const week of weeks) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawWeek(page, week, { bold, regular, oblique, logo });
  }

  return pdf.save();
}

function emptyWeek(doc: MasterPlanDocument): MasterPlanWeekPage {
  return {
    title: `${doc.clientName}'s Master Metabolic Plan`,
    weekOfLabel: 'Week of',
    waterGoalLabel: `Water goal ${doc.waterGoalOz} oz`,
    tracker: [],
    exerciseKey: [],
    meals: { layout: doc.layout, slots: [] },
    exercisePlan: [],
    substitutions: [],
    reminders: []
  };
}

type Fonts = { bold: PDFFont; regular: PDFFont; oblique: PDFFont; logo: PDFImage | null };

function drawWeek(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts) {
  let top = MARGIN_TOP;
  top = drawHeader(page, week, fonts, top);
  top = drawSectionLabel(page, 'Tracker', fonts.bold, top + 8);
  top = drawTracker(page, week, fonts, top);
  top = drawSectionLabel(page, 'Exercise key', fonts.bold, top + 10);
  top = drawExerciseKey(page, week, fonts, top);
  top = drawSectionLabel(page, 'Meals', fonts.bold, top + 8);

  const planRows = Math.ceil(week.exercisePlan.length / 2) || 1;
  const planHeight = 16 + planRows * 11;
  const footerHeight = 22 + Math.max(week.substitutions.length, week.reminders.length, 1) * 11;
  const mealsBottom = PAGE_HEIGHT - MARGIN_BOTTOM - footerHeight - planHeight;
  top = drawMeals(page, week, fonts, top, Math.max(top + 40, mealsBottom));
  top = drawSectionLabel(page, 'Exercise plan', fonts.bold, top + 6);
  top = drawExercisePlan(page, week, fonts, top);
  drawFootnotes(page, week, fonts, top + 6);
}

function drawHeader(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number) {
  const logoH = 32;
  let textX = MARGIN_X;
  if (fonts.logo) {
    const logoW = (fonts.logo.width / fonts.logo.height) * logoH;
    page.drawImage(fonts.logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - top - logoH,
      width: logoW,
      height: logoH
    });
    textX = MARGIN_X + logoW + 10;
  }

  const titleWidth = MARGIN_X + CONTENT_WIDTH - textX;
  const titleSize = fitSize(fonts.bold, week.title, titleWidth, 13, 9);
  page.drawText(sanitizePdfText(week.title), {
    x: textX,
    y: PAGE_HEIGHT - top - 14,
    size: titleSize,
    font: fonts.bold,
    color: NAVY
  });
  page.drawText(sanitizePdfText(`${week.weekOfLabel}    ${week.waterGoalLabel}`), {
    x: textX,
    y: PAGE_HEIGHT - top - 28,
    size: 9,
    font: fonts.regular,
    color: MUTED
  });

  const ruleY = PAGE_HEIGHT - top - logoH - 6;
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: MARGIN_X + CONTENT_WIDTH, y: ruleY },
    thickness: 2,
    color: GREEN
  });
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY - 3 },
    end: { x: MARGIN_X + 72, y: ruleY - 3 },
    thickness: 2,
    color: GOLD
  });
  return top + logoH + 12;
}

function drawSectionLabel(page: PDFPage, label: string, font: PDFFont, top: number) {
  page.drawText(label.toUpperCase(), {
    x: MARGIN_X,
    y: PAGE_HEIGHT - top - 8,
    size: 8,
    font,
    color: GREEN
  });
  return top + 12;
}

function drawTracker(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number) {
  const headerH = 14;
  const rowH = 14;
  const tableH = headerH + week.tracker.length * rowH;
  const tableTop = PAGE_HEIGHT - top;

  page.drawRectangle({
    x: MARGIN_X,
    y: tableTop - tableH,
    width: CONTENT_WIDTH,
    height: tableH,
    borderColor: RULE,
    borderWidth: 0.6,
    color: WHITE
  });

  page.drawRectangle({
    x: MARGIN_X,
    y: tableTop - headerH,
    width: CONTENT_WIDTH,
    height: headerH,
    color: HEADER_BG
  });

  for (const [index] of week.tracker.entries()) {
    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_X,
        y: tableTop - headerH - (index + 1) * rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: ROW_ALT
      });
    }
  }

  let x = MARGIN_X;
  for (const column of TRACKER_COLUMNS) {
    page.drawText(column.label, {
      x: x + 3,
      y: tableTop - 10,
      size: 7,
      font: fonts.bold,
      color: NAVY
    });
    if (x > MARGIN_X) {
      page.drawLine({
        start: { x, y: tableTop },
        end: { x, y: tableTop - tableH },
        thickness: 0.4,
        color: RULE
      });
    }
    x += column.width;
  }

  week.tracker.forEach((row, index) => {
    const rowTop = tableTop - headerH - index * rowH;
    page.drawLine({
      start: { x: MARGIN_X, y: rowTop },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: rowTop },
      thickness: 0.3,
      color: RULE
    });
    let cellX = MARGIN_X;
    const values = [row.day, row.exercise, '', '', '', '', '', '', row.notes];
    values.forEach((value, columnIndex) => {
      const column = TRACKER_COLUMNS[columnIndex]!;
      const isMeal = columnIndex >= 2 && columnIndex <= 5;
      if (isMeal) {
        const box = 7;
        page.drawRectangle({
          x: cellX + column.width / 2 - box / 2,
          y: rowTop - rowH / 2 - box / 2 + 1,
          width: box,
          height: box,
          borderColor: NAVY,
          borderWidth: 0.7
        });
      } else {
        const font = columnIndex === 0 ? fonts.bold : row.exercise === 'Rest' && columnIndex === 1 ? fonts.oblique : fonts.regular;
        const size = 7.5;
        page.drawText(ellipsize(value, font, size, column.width - 6), {
          x: cellX + 3,
          y: rowTop - 11,
          size,
          font,
          color: columnIndex === 1 && value === 'Rest' ? MUTED : NAVY
        });
      }
      cellX += column.width;
    });
  });

  return top + tableH;
}

function drawExerciseKey(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number) {
  if (!week.exerciseKey.length) {
    page.drawText('No exercises planned this week.', {
      x: MARGIN_X,
      y: PAGE_HEIGHT - top - 9,
      size: 8,
      font: fonts.oblique,
      color: MUTED
    });
    return top + 12;
  }

  const columns = 2;
  const colW = CONTENT_WIDTH / columns;
  const rowH = 11;
  const rows = Math.ceil(week.exerciseKey.length / columns);
  week.exerciseKey.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const label = `${entry.key}  ${entry.name} - ${entry.prescription}`;
    page.drawText(ellipsize(label, fonts.regular, 8, colW - 8), {
      x: MARGIN_X + col * colW,
      y: PAGE_HEIGHT - top - 9 - row * rowH,
      size: 8,
      font: fonts.regular,
      color: NAVY
    });
  });
  return top + rows * rowH;
}

function drawMeals(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number, bottom: number) {
  const slots = week.meals.slots;
  if (!slots.length) return top;
  if (week.meals.layout === 'horizontal') return drawHorizontalMeals(page, slots, fonts, top, bottom);
  return drawVerticalMeals(page, slots, fonts, top, bottom);
}

function slotLineCount(slot: MealSlotSection) {
  return slot.groups.reduce((sum, group) => sum + group.lines.length + (group.label ? 1 : 0), 0);
}

function drawHorizontalMeals(page: PDFPage, slots: MealSlotSection[], fonts: Fonts, top: number, bottom: number) {
  const primary = slots.slice(0, 4);
  const extra = slots.slice(4);
  const gap = 8;
  const leading = 10;
  const contentLines = Math.max(...primary.map(slotLineCount), 1);
  const naturalH = 18 + contentLines * leading + 8;
  const available = Math.max(56, bottom - top - (extra.length ? 16 : 0));
  const boxH = Math.min(available, naturalH);
  const boxW = (CONTENT_WIDTH - gap * (primary.length - 1)) / Math.max(primary.length, 1);
  const boxTop = PAGE_HEIGHT - top;

  primary.forEach((slot, index) => {
    const x = MARGIN_X + index * (boxW + gap);
    page.drawRectangle({
      x,
      y: boxTop - boxH,
      width: boxW,
      height: boxH,
      borderColor: RULE,
      borderWidth: 0.7,
      color: WHITE
    });
    page.drawRectangle({
      x,
      y: boxTop - 14,
      width: boxW,
      height: 14,
      color: HEADER_BG
    });
    page.drawText(ellipsize(slot.title, fonts.bold, 7.5, boxW - 8), {
      x: x + 4,
      y: boxTop - 10,
      size: 7.5,
      font: fonts.bold,
      color: NAVY
    });
    drawSlotLines(page, slot, fonts.regular, x + 4, top + 18, boxW - 8, boxH - 22, 8, 10);
  });

  let next = top + boxH;
  if (extra.length) {
    const extraLine = extra.map((slot) => `${slot.title}: ${slot.groups.flatMap((group) => group.lines).join('; ')}`).join('   ');
    page.drawText(ellipsize(extraLine, fonts.regular, 7.5, CONTENT_WIDTH), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - next - 12,
      size: 7.5,
      font: fonts.regular,
      color: MUTED
    });
    next += 16;
  }
  return next;
}

function drawVerticalMeals(page: PDFPage, slots: MealSlotSection[], fonts: Fonts, top: number, bottom: number) {
  const leading = 9;
  const natural = slots.map((slot) => 14 + slotLineCount(slot) * leading + 4);
  const naturalSum = natural.reduce((sum, height) => sum + height, 0);
  const available = Math.max(40, bottom - top);
  const scale = naturalSum > available ? available / naturalSum : 1;
  let cursor = top;
  slots.forEach((slot, index) => {
    const slotH = natural[index]! * scale;
    const yTop = PAGE_HEIGHT - cursor;
    page.drawRectangle({
      x: MARGIN_X,
      y: yTop - slotH + 3,
      width: 3,
      height: Math.max(8, slotH - 6),
      color: GREEN
    });
    page.drawText(ellipsize(slot.title, fonts.bold, 8, CONTENT_WIDTH - 12), {
      x: MARGIN_X + 8,
      y: yTop - 11,
      size: 8,
      font: fonts.bold,
      color: NAVY
    });
    drawSlotLines(page, slot, fonts.regular, MARGIN_X + 8, cursor + 14, CONTENT_WIDTH - 12, slotH - 16, 8, leading);
    cursor += slotH;
  });
  return cursor;
}

function drawSlotLines(
  page: PDFPage,
  slot: MealSlotSection,
  font: PDFFont,
  x: number,
  top: number,
  width: number,
  height: number,
  size: number,
  leading: number
) {
  const maxLines = Math.max(1, Math.floor(height / leading));
  const lines: string[] = [];
  for (const group of slot.groups) {
    if (group.label) lines.push(group.label);
    lines.push(...group.lines);
  }
  const visible = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `+ ${lines.length - (maxLines - 1)} more`] : lines;
  visible.forEach((line, index) => {
    page.drawText(ellipsize(line, font, size, width), {
      x,
      y: PAGE_HEIGHT - top - size - index * leading,
      size,
      font,
      color: NAVY
    });
  });
}

function drawExercisePlan(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number) {
  const rows = Math.ceil(week.exercisePlan.length / 2) || 1;
  const colW = CONTENT_WIDTH / 2;
  week.exercisePlan.forEach((day, index) => {
    const col = index < rows ? 0 : 1;
    const row = index < rows ? index : index - rows;
    const font = day.line === 'Rest' ? fonts.oblique : fonts.regular;
    const line = `${day.day}   ${day.line}`;
    page.drawText(ellipsize(line, font, 8, colW - 8), {
      x: MARGIN_X + col * colW,
      y: PAGE_HEIGHT - top - 9 - row * 11,
      size: 8,
      font,
      color: day.line === 'Rest' ? MUTED : NAVY
    });
  });
  return top + rows * 11;
}

function drawFootnotes(page: PDFPage, week: MasterPlanWeekPage, fonts: Fonts, top: number) {
  const gap = 16;
  const colW = (CONTENT_WIDTH - gap) / 2;
  page.drawText('SUBSTITUTIONS', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - top - 8,
    size: 7,
    font: fonts.bold,
    color: MUTED
  });
  page.drawText('REMINDERS', {
    x: MARGIN_X + colW + gap,
    y: PAGE_HEIGHT - top - 8,
    size: 7,
    font: fonts.bold,
    color: MUTED
  });
  week.substitutions.forEach((line, index) => {
    page.drawText(ellipsize(line, fonts.regular, 8, colW), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - top - 20 - index * 11,
      size: 8,
      font: fonts.regular,
      color: NAVY
    });
  });
  week.reminders.forEach((line, index) => {
    page.drawText(ellipsize(line, fonts.regular, 8, colW), {
      x: MARGIN_X + colW + gap,
      y: PAGE_HEIGHT - top - 20 - index * 11,
      size: 8,
      font: fonts.regular,
      color: NAVY
    });
  });
}

function fitSize(font: PDFFont, text: string, maxWidth: number, preferred: number, min: number) {
  const clean = sanitizePdfText(text);
  let size = preferred;
  while (size > min && font.widthOfTextAtSize(clean, size) > maxWidth) size -= 0.5;
  return size;
}

function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number) {
  const clean = sanitizePdfText(text);
  if (!clean) return '';
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let next = clean;
  while (next.length > 1 && font.widthOfTextAtSize(`${next}...`, size) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}
