/** Additive proof helpers; no gameplay mutation or identity substitution. */
export async function completeBeforeStart(context, prepare, start) {
  await prepare?.(context);
  return start();
}

export function chooseAffordableRation(options, available) {
  if (!Number.isSafeInteger(available) || available < 0) throw Error('Actual current stores are required.');
  const choices = options.map(option => {
    const match = option.text.match(/\/\/\s*([\d,]+(?:\.\d+)?)\s*\/\//);
    const cost = match ? Number(match[1].replaceAll(',', '')) : NaN;
    if (!/^[0-3]$/.test(option.value) || !Number.isFinite(cost) || cost < 0)
      throw Error('The visible printed ration cost is unavailable.');
    return { ...option, cost };
  }).filter(option => option.cost <= available).sort((left, right) => Number(right.value) - Number(left.value));
  if (!choices.length) throw Error('No visible affordable ration choice exists.');
  return choices[0].value;
}
