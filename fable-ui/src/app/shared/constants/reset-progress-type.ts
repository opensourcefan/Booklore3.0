export const ResetProgressTypes = {
  KOREADER: 'KOREADER',
  FABLE: 'FABLE',
  KOBO: 'KOBO'
} as const;

export type ResetProgressType = keyof typeof ResetProgressTypes;
