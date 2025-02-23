import { mockConnection, mockMultiaddrConnection, mockRegistrar, mockStream, mockUpgrader } from '@libp2p/interface-mocks'
import { EventEmitter } from '@libp2p/interfaces/events'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import { detect } from 'detect-browser'
import { pair } from 'it-pair'
import { duplexPair } from 'it-pair/duplex'
import { pbStream } from 'it-pb-stream'
import Sinon from 'sinon'
import { initiateConnection, handleIncomingStream } from '../src/private-to-private/handler'
import { Message } from '../src/private-to-private/pb/message.js'
import { WebRTCTransport } from '../src/private-to-private/transport'

const browser = detect()

describe('webrtc basic', () => {
  const isFirefox = ((browser != null) && browser.name === 'firefox')
  it('should connect', async () => {
    const [receiver, initiator] = duplexPair<any>()
    const dstPeerId = await createEd25519PeerId()
    const connection = mockConnection(
      mockMultiaddrConnection(pair<any>(), dstPeerId)
    )
    const controller = new AbortController()
    const initiatorPeerConnectionPromise = initiateConnection({ stream: mockStream(initiator), signal: controller.signal })
    const receiverPeerConnectionPromise = handleIncomingStream({ stream: mockStream(receiver), connection })
    await expect(initiatorPeerConnectionPromise).to.be.fulfilled()
    await expect(receiverPeerConnectionPromise).to.be.fulfilled()
    const [{ pc: pc0 }, { pc: pc1 }] = await Promise.all([initiatorPeerConnectionPromise, receiverPeerConnectionPromise])
    if (isFirefox) {
      expect(pc0.iceConnectionState).eq('connected')
      expect(pc1.iceConnectionState).eq('connected')
      return
    }
    expect(pc0.connectionState).eq('connected')
    expect(pc1.connectionState).eq('connected')
  })
})

describe('webrtc receiver', () => {
  it('should fail receiving on invalid sdp offer', async () => {
    const [receiver, initiator] = duplexPair<any>()
    const dstPeerId = await createEd25519PeerId()
    const connection = mockConnection(
      mockMultiaddrConnection(pair<any>(), dstPeerId)
    )
    const receiverPeerConnectionPromise = handleIncomingStream({ stream: mockStream(receiver), connection })
    const stream = pbStream(initiator).pb(Message)

    stream.write({ type: Message.Type.SDP_OFFER, data: 'bad' })
    await expect(receiverPeerConnectionPromise).to.be.rejectedWith(/Failed to set remoteDescription/)
  })
})

describe('webrtc dialer', () => {
  it('should fail receiving on invalid sdp answer', async () => {
    const [receiver, initiator] = duplexPair<any>()
    const controller = new AbortController()
    const initiatorPeerConnectionPromise = initiateConnection({ signal: controller.signal, stream: mockStream(initiator) })
    const stream = pbStream(receiver).pb(Message)

    {
      const offerMessage = await stream.read()
      expect(offerMessage.type).to.eq(Message.Type.SDP_OFFER)
    }

    stream.write({ type: Message.Type.SDP_ANSWER, data: 'bad' })
    await expect(initiatorPeerConnectionPromise).to.be.rejectedWith(/Failed to set remoteDescription/)
  })

  it('should fail on receiving a candidate before an answer', async () => {
    const [receiver, initiator] = duplexPair<any>()
    const controller = new AbortController()
    const initiatorPeerConnectionPromise = initiateConnection({ signal: controller.signal, stream: mockStream(initiator) })
    const stream = pbStream(receiver).pb(Message)

    const pc = new RTCPeerConnection()
    pc.onicecandidate = ({ candidate }) => {
      stream.write({ type: Message.Type.ICE_CANDIDATE, data: JSON.stringify(candidate?.toJSON()) })
    }
    {
      const offerMessage = await stream.read()
      expect(offerMessage.type).to.eq(Message.Type.SDP_OFFER)
      const offer = new RTCSessionDescription({ type: 'offer', sdp: offerMessage.data })
      await pc.setRemoteDescription(offer)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
    }

    await expect(initiatorPeerConnectionPromise).to.be.rejectedWith(/remote should send an SDP answer/)
  })
})

describe('webrtc filter', () => {
  it('can filter multiaddrs to dial', async () => {
    const transport = new WebRTCTransport({
      transportManager: Sinon.stub() as any,
      peerId: Sinon.stub() as any,
      registrar: mockRegistrar(),
      upgrader: mockUpgrader({}),
      events: new EventEmitter()
    }, {})

    const valid = [
      multiaddr('/ip4/127.0.0.1/tcp/1234/ws/p2p-circuit/webrtc')
    ]

    expect(transport.filter(valid)).length(1)
  })
})

export { }
