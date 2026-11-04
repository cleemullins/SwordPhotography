import { automaticLightPlacement } from './automatic-lighting'
import type { StudioState } from './model'

self.onmessage = (event: MessageEvent<StudioState>) => {
  try { self.postMessage({ result: automaticLightPlacement(event.data) }) }
  catch (error) { self.postMessage({ error: String(error) }) }
}
