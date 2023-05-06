import { Configuration, OpenAIApi } from 'openai';

export default class OpenaiRepository {
  #openai;

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
      organization: 'org-dlzE8QUXcRrvBN096fSCdHBf',
    });

    this.#openai = new OpenAIApi(configuration);

    this.chatCompletion = this.chatCompletion.bind(this);
  }

  chatCompletion = async (
    messages: any
  ): Promise<{ role: string; content: string } | null> => {
    try {
      const apiRequestBot = {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.6,
      };

      const completion = await this.#openai.createChatCompletion(apiRequestBot);

      return completion.data.choices[0].message;
    } catch (error) {
      console.log('error= ', error.message);
      return null;
    }
  };
}
