/** Erreur de service de l'assistant, traduite en reponse HTTP lisible par l'interface. */
export class AssistantUnavailable extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
