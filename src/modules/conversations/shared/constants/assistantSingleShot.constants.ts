export enum AssistantSingleShotStatus {
  COMPLETED = 'completed',
  FAILED = 'failed', // Part of the shared contract; the bot itself never reports it
  UNKNOWN = 'unknown',
}

export const ASSISTANT_RESULT_UNCONFIRMED_CODE = 'result_unconfirmed'

export const assistantSingleShotMessages = {
  skipped: 'Mensaje no procesado.',
  emptyResponse: 'La respuesta no tiene contenido para mostrar en este dispositivo.',
  unconfirmed: 'No se pudo confirmar el resultado.',
}

const ASSISTANT_REST_DEFAULT_MAX_CHARS = 2000

const readPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Text limits of the assistant REST entry point, read on each call so env changes apply
 */
export const getAssistantRestLimits = (): { maxInputChars: number; maxOutputChars: number } => ({
  maxInputChars: readPositiveInt(
    process.env.ASSISTANT_REST_MAX_INPUT_CHARS,
    ASSISTANT_REST_DEFAULT_MAX_CHARS
  ),
  maxOutputChars: readPositiveInt(
    process.env.ASSISTANT_REST_MAX_OUTPUT_CHARS,
    ASSISTANT_REST_DEFAULT_MAX_CHARS
  ),
})
