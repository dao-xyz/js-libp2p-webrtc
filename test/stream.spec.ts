
import { expect } from 'aegir/chai'
import { Uint8ArrayList } from 'uint8arraylist'
import * as underTest from '../src/stream'

const setup = (cb: { send: (bytes: Uint8Array) => void }): underTest.WebRTCStream => {
  const datachannel = {
    readyState: 'open',
    send: cb.send

  }
  return new underTest.WebRTCStream({ channel: datachannel as RTCDataChannel, stat: underTest.defaultStat('outbound') })
}

const MAX_MESSAGE_SIZE = 16 * 1024
describe('MessageProcessor', () => {
  it(`sends messages smaller or equal to ${MAX_MESSAGE_SIZE} bytes in one`, () => {
    const sent: Uint8Array[] = []
    const webrtcStream = setup({ send: (bytes) => sent.push(bytes) })
    webrtcStream.messageProcessor.send(new Uint8ArrayList(new Uint8Array(MAX_MESSAGE_SIZE)))
    expect(sent).to.deep.equals([new Uint8Array(MAX_MESSAGE_SIZE)])
  })

  it(`sends messages larger than ${MAX_MESSAGE_SIZE} bytes in parts`, () => {
    const sent: Uint8Array[] = []
    const webrtcStream = setup({ send: (bytes) => sent.push(bytes) })
    webrtcStream.messageProcessor.send(new Uint8ArrayList(new Uint8Array(MAX_MESSAGE_SIZE + 1)))
    expect(sent).to.deep.equals([new Uint8Array(MAX_MESSAGE_SIZE), new Uint8Array(1)])
  })
})
