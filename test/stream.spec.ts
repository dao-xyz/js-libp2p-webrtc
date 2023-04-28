
import * as underTest from '../src/stream'
import { expect } from 'aegir/chai'
import { Uint8ArrayList } from 'uint8arraylist'

const setup = (cb: { send: (bytes: Uint8Array) => void }, maxMsgSize?: number): underTest.WebRTCStream => {
  const datachannel = {
    readyState: 'open',
    send: cb.send

  }
  return new underTest.WebRTCStream({ channel: datachannel as RTCDataChannel, stat: underTest.defaultStat('outbound'), maxMsgSize })
}

describe('MessageProcessor', () => {
  it('handles unconstrained message', () => {
    const sent: Uint8Array[] = []
    const webrtcStream = setup({ send: (bytes) => sent.push(bytes) })
    webrtcStream.messageProcessor.send(new Uint8ArrayList(new Uint8Array(1)))
    expect(sent).to.deep.equals([new Uint8Array(1)])
  })

  it('handles bounded by message size', () => {
    const sent: Uint8Array[] = []
    const maxMsgSize = 1
    const webrtcStream = setup({ send: (bytes) => sent.push(bytes) }, maxMsgSize)
    webrtcStream.messageProcessor.send(new Uint8ArrayList(new Uint8Array(2)))
    expect(sent).to.deep.equals([new Uint8Array(1), new Uint8Array(1)])
  })
})
