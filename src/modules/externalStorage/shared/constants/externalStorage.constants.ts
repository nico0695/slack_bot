export enum StorageSourceModule {
  IMAGES = 'IMAGES',
  TEXT_TO_SPEECH = 'TEXT_TO_SPEECH',
  CONVERSATIONS = 'CONVERSATIONS',
  SLACK = 'SLACK',
}

export const StoragePathByModule: Record<StorageSourceModule, string> = {
  [StorageSourceModule.IMAGES]: 'images/generated',
  [StorageSourceModule.TEXT_TO_SPEECH]: 'tts/audio',
  [StorageSourceModule.CONVERSATIONS]: 'conversations/files',
  [StorageSourceModule.SLACK]: 'slack/uploads',
}
