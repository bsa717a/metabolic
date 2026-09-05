const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type SessionRecapMealItem = {
  name: string;
  quantity: number;
  unit: string;
};

export type SessionRecapMeal = {
  name: string;
  plannedTime: string | null;
  items: SessionRecapMealItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type SessionRecapRoutineDay = {
  weekday: number;
  workoutName: string | null;
};

export type SessionRecapLinks = {
  dashboard: string;
  nutrition: string;
  exercise: string;
};

export type SessionRecapInput = {
  clientFirstName: string;
  coachName: string;
  notes: string;
  nextMeetingAt: Date | null;
  timeZone: string | null;
  tomorrowDateKey: string;
  tomorrowMeals: SessionRecapMeal[];
  weekRoutine: SessionRecapRoutineDay[];
  tomorrowWorkoutName: string | null;
  links: SessionRecapLinks;
};

export type SessionRecapEmail = {
  subject: string;
  text: string;
  html: string;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function formatSessionRecapQuantity(quantity: number, unit: string, name: string) {
  const qty = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1).replace(/\.0$/, '');
  const unitLabel = unit.trim();
  return `${qty}${unitLabel ? ` ${unitLabel}` : ''} ${name}`.trim();
}

export function formatSessionRecapTime(plannedTime: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 || 12;
  return minute === '00' ? `${hour12}${suffix}` : `${hour12}:${minute}${suffix}`;
}

export function formatSessionRecapMeeting(date: Date, timeZone: string | null) {
  const tz = timeZone?.trim() || 'UTC';
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz
  };
  try {
    return date.toLocaleString('en-US', options);
  } catch {
    return date.toLocaleString('en-US', { ...options, timeZone: 'UTC' });
  }
}

export function formatSessionRecapDay(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function weekdayLabel(weekday: number) {
  return WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
}

export function buildSessionRecapEmail(input: SessionRecapInput): SessionRecapEmail {
  const greeting = input.clientFirstName.trim() || 'there';
  const coach = input.coachName.trim() || 'Your coach';
  const notes = input.notes.trim();
  const tomorrowLabel = formatSessionRecapDay(input.tomorrowDateKey);
  const nextMeeting = input.nextMeetingAt
    ? formatSessionRecapMeeting(input.nextMeetingAt, input.timeZone)
    : null;

  const subject = `${greeting}, your recap from ${coach} is in`;

  const text = buildText({
    greeting,
    coach,
    notes,
    nextMeeting,
    tomorrowLabel,
    meals: input.tomorrowMeals,
    weekRoutine: input.weekRoutine,
    tomorrowWorkoutName: input.tomorrowWorkoutName,
    links: input.links
  });

  const html = buildHtml({
    greeting,
    coach,
    notes,
    nextMeeting,
    tomorrowLabel,
    meals: input.tomorrowMeals,
    weekRoutine: input.weekRoutine,
    tomorrowWorkoutName: input.tomorrowWorkoutName,
    links: input.links
  });

  return { subject, text, html };
}

function buildText(options: {
  greeting: string;
  coach: string;
  notes: string;
  nextMeeting: string | null;
  tomorrowLabel: string;
  meals: SessionRecapMeal[];
  weekRoutine: SessionRecapRoutineDay[];
  tomorrowWorkoutName: string | null;
  links: SessionRecapLinks;
}) {
  const lines = [
    `Hey ${options.greeting}!`,
    '',
    `${options.coach} just wrapped today's session and packed the good stuff into this recap.`,
    ''
  ];

  lines.push('FROM YOUR COACH');
  lines.push(options.notes || `${options.coach} didn't leave written notes this time — the plan below is the takeaway.`);
  lines.push('');

  lines.push('SEE YOU NEXT');
  lines.push(
    options.nextMeeting
      ? `Your next session is ${options.nextMeeting}. Put it on the fridge. Or at least on your phone.`
      : `No next session on the calendar yet. Ping ${options.coach} if you want to lock in a time.`
  );
  lines.push('');

  lines.push(`TOMORROW'S PLATE — ${options.tomorrowLabel.toUpperCase()}`);
  if (!options.meals.length) {
    lines.push(`Tomorrow's plan is still a blank canvas. Check the app in case ${options.coach} is still plating it.`);
  } else {
    for (const meal of options.meals) {
      const time = formatSessionRecapTime(meal.plannedTime);
      const header = [meal.name, time, meal.calories > 0 ? `${Math.round(meal.calories)} kcal` : null]
        .filter(Boolean)
        .join(' · ');
      lines.push(header);
      if (!meal.items.length) {
        lines.push('  (foods coming soon)');
      } else {
        for (const item of meal.items) {
          lines.push(`  • ${formatSessionRecapQuantity(item.quantity, item.unit, item.name)}`);
        }
      }
    }
  }
  lines.push('');

  lines.push("THIS WEEK'S WORKOUTS");
  if (options.tomorrowWorkoutName) {
    lines.push(`Tomorrow you're on ${options.tomorrowWorkoutName}. Here's the full lineup:`);
  } else if (!options.weekRoutine.length) {
    lines.push("Your weekly lineup isn't set yet — stay tuned.");
  } else {
    lines.push('Just the names of the routines — details live in the app.');
  }
  for (const day of options.weekRoutine) {
    lines.push(`  ${weekdayLabel(day.weekday)} — ${day.workoutName?.trim() || 'Rest day'}`);
  }
  lines.push('');

  lines.push('Jump back in:');
  lines.push(`  Dashboard: ${options.links.dashboard}`);
  lines.push(`  Nutrition: ${options.links.nutrition}`);
  lines.push(`  Exercise: ${options.links.exercise}`);
  lines.push('');
  lines.push('Questions? Text your coach or hop into the app. Keep the streak going.');
  lines.push('');
  lines.push(`— ${options.coach} + Metabolic OS`);

  return lines.join('\n');
}

function buildHtml(options: {
  greeting: string;
  coach: string;
  notes: string;
  nextMeeting: string | null;
  tomorrowLabel: string;
  meals: SessionRecapMeal[];
  weekRoutine: SessionRecapRoutineDay[];
  tomorrowWorkoutName: string | null;
  links: SessionRecapLinks;
}) {
  const notesBody = options.notes
    ? `<div style="font:400 15px/1.7 Arial,Helvetica,sans-serif;color:#1b2733">${escapeHtml(options.notes).replaceAll('\n', '<br>')}</div>`
    : `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#64748b">${escapeHtml(options.coach)} didn't leave written notes this time — the plan below is the takeaway.</div>`;

  const nextBody = options.nextMeeting
    ? `<div style="font:700 18px/1.35 Arial,Helvetica,sans-serif;color:#1b2733">${escapeHtml(options.nextMeeting)}</div>
       <div style="font:400 13px/1.55 Arial,Helvetica,sans-serif;color:#64748b;margin-top:6px">Put it on the fridge. Or at least on your phone.</div>`
    : `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#64748b">No next session on the calendar yet. Ping ${escapeHtml(options.coach)} if you want to lock in a time.</div>`;

  const mealsBody = options.meals.length
    ? options.meals.map((meal) => mealHtml(meal)).join('')
    : `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#64748b">Tomorrow's plan is still a blank canvas. Check the app in case ${escapeHtml(options.coach)} is still plating it.</div>`;

  const weekIntro = options.tomorrowWorkoutName
    ? `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#1b2733;margin-bottom:12px">Tomorrow you're on <strong>${escapeHtml(options.tomorrowWorkoutName)}</strong>. Here's the full lineup:</div>`
    : options.weekRoutine.length
      ? `<div style="font:400 13px/1.55 Arial,Helvetica,sans-serif;color:#64748b;margin-bottom:12px">Just the names of the routines — details live in the app.</div>`
      : `<div style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:#64748b">Your weekly lineup isn't set yet — stay tuned.</div>`;

  const weekRows = options.weekRoutine
    .map((day) => {
      const name = day.workoutName?.trim() || 'Rest day';
      const rest = !day.workoutName?.trim();
      return `<tr>
        <td style="padding:8px 0;font:700 13px/1.3 Arial,Helvetica,sans-serif;color:#1b2733;width:110px">${escapeHtml(weekdayLabel(day.weekday))}</td>
        <td style="padding:8px 0;font:${rest ? '400' : '700'} 13px/1.3 Arial,Helvetica,sans-serif;color:${rest ? '#64748b' : '#1b2733'}">${escapeHtml(name)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.greeting)}, your recap is in</title>
</head>
<body style="margin:0;padding:0;background:#e7ebef;-webkit-font-smoothing:antialiased">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#e7ebef">Notes from ${escapeHtml(options.coach)}, your next session, tomorrow's meals, and this week's workouts.</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#e7ebef">
  <tr><td align="center" style="padding:26px 12px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="padding:0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;border-collapse:collapse">
          <tr><td style="padding:30px 40px 26px;background:#1b2733">
            <div style="font:700 20px/1 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:-.01em">Metabolic&nbsp;OS</div>
            <div style="font:400 13px/1 Arial,Helvetica,sans-serif;color:#9fb0c2;margin-top:7px">Session recap, served hot.</div>
          </td></tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;border-collapse:collapse">
          <tr><td style="padding:34px 40px 8px">
            <div style="font:700 26px/1.25 Arial,Helvetica,sans-serif;color:#1b2733;letter-spacing:-.02em">Hey ${escapeHtml(options.greeting)} — today's session is in the books.</div>
            <div style="font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#64748b;margin-top:12px">${escapeHtml(options.coach)} packed your notes, next meet-up, tomorrow's plate, and this week's workouts into one recap.</div>
          </td></tr>
        </table>
        ${sectionCard('#eff5ff', '#3b82f6', '1', 'From your coach', notesBody)}
        ${sectionCard('#fdf6e3', '#b7891a', '2', 'See you next', nextBody)}
        ${sectionCard('#e7f6ee', '#0f9d58', '3', `Tomorrow's plate · ${options.tomorrowLabel}`, mealsBody)}
        ${sectionCard('#fff2e8', '#f97316', '4', "This week's workouts", `${weekIntro}${weekRows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse">${weekRows}</table>` : ''}`)}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;border-collapse:collapse">
          <tr><td align="center" style="padding:8px 40px 36px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
              <tr><td align="center" bgcolor="#3b82f6" style="border-radius:11px"><a href="${escapeHtml(options.links.dashboard)}" style="display:block;padding:15px 40px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:11px">Open your dashboard &rarr;</a></td></tr>
            </table>
            <div style="font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#64748b;margin-top:16px">
              <a href="${escapeHtml(options.links.nutrition)}" style="color:#3b82f6;text-decoration:none;font-weight:700">Nutrition</a>
              &nbsp;·&nbsp;
              <a href="${escapeHtml(options.links.exercise)}" style="color:#3b82f6;text-decoration:none;font-weight:700">Exercise</a>
            </div>
            <div style="font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#64748b;margin-top:12px">Questions? Text ${escapeHtml(options.coach)} or hop into the app. Keep the streak going.</div>
            <div style="font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#1b2733;margin-top:18px">— ${escapeHtml(options.coach)} + Metabolic OS</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function sectionCard(tint: string, accent: string, step: string, title: string, body: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;border-collapse:collapse">
  <tr><td style="padding:18px 40px 6px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px;border-collapse:collapse;background:${tint};border-radius:14px">
      <tr><td style="padding:18px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-bottom:12px">
          <tr>
            <td width="36" valign="middle" style="width:36px;padding-right:12px">
              <div style="width:28px;height:28px;background:#ffffff;border-radius:8px;text-align:center"><div style="font:700 13px/28px Arial,Helvetica,sans-serif;color:${accent}">${step}</div></div>
            </td>
            <td valign="middle"><div style="font:700 15px/1.3 Arial,Helvetica,sans-serif;color:#1b2733">${escapeHtml(title)}</div></td>
          </tr>
        </table>
        ${body}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function mealHtml(meal: SessionRecapMeal) {
  const time = formatSessionRecapTime(meal.plannedTime);
  const meta = [time, meal.calories > 0 ? `${Math.round(meal.calories)} kcal` : null].filter(Boolean).join(' · ');
  const items = meal.items.length
    ? `<div style="margin-top:8px">${meal.items
        .map(
          (item) =>
            `<div style="font:400 13px/1.55 Arial,Helvetica,sans-serif;color:#334155">• ${escapeHtml(formatSessionRecapQuantity(item.quantity, item.unit, item.name))}</div>`
        )
        .join('')}</div>`
    : `<div style="font:400 13px/1.55 Arial,Helvetica,sans-serif;color:#94a3b8;margin-top:8px">Foods coming soon</div>`;

  return `<div style="margin-bottom:14px">
    <div style="font:700 14px/1.3 Arial,Helvetica,sans-serif;color:#1b2733">${escapeHtml(meal.name)}</div>
    ${meta ? `<div style="font:400 12px/1.4 Arial,Helvetica,sans-serif;color:#64748b;margin-top:2px">${escapeHtml(meta)}</div>` : ''}
    ${items}
  </div>`;
}
