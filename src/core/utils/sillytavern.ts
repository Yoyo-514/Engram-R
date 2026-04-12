export type TavernContext = typeof SillyTavern;
export type TavernCharacter = SillyTavern.v1CharData;

export function getTavernContext(): TavernContext | null | undefined {
  return (
    window as Window & {
      SillyTavern?: {
        getContext?: () => TavernContext;
      };
    }
  ).SillyTavern?.getContext?.();
}

export function getCurrentTavernCharacter(
  context: TavernContext | null | undefined = getTavernContext()
): TavernCharacter | null {
  if (!context?.characters || context.characterId === null || context.characterId === undefined) {
    return null;
  }

  const characterId = String(context.characterId).trim();
  if (!characterId) {
    return null;
  }

  const characterIndex = Number.parseInt(characterId, 10);
  if (!Number.isNaN(characterIndex) && characterIndex >= 0) {
    return context.characters[characterIndex] || null;
  }

  return context.characters.find((item) => item.avatar === characterId) || null;
}
