import type { Stream } from '@libp2p/interface-connection'
import type { StreamMuxer, StreamMuxerFactory, StreamMuxerInit } from '@libp2p/interface-stream-muxer'
import type { Source, Sink } from 'it-stream-types'

import { WebRTCStream } from './stream.js'
import { nopSink, nopSource } from './util.js'

const WEBRTC_PROTOCOL_NAME = '/webrtc'
export interface MessageSizeOption { maxMsgSize?: number }
export class DataChannelMuxerFactory implements StreamMuxerFactory {
  /**
   * WebRTC Peer Connection
   */
  private readonly peerConnection: RTCPeerConnection
  private streamBuffer: WebRTCStream[] = []

  constructor (peerConnection: RTCPeerConnection, readonly options?: MessageSizeOption, readonly protocol = WEBRTC_PROTOCOL_NAME) {
    this.peerConnection = peerConnection
    this.options = options
    // store any datachannels opened before upgrade has been completed
    this.peerConnection.ondatachannel = ({ channel }) => {
      const stream = new WebRTCStream({
        channel,
        maxMsgSize: options?.maxMsgSize,
        stat: {
          direction: 'inbound',
          timeline: { open: 0 }
        },
        closeCb: (_stream) => {
          this.streamBuffer = this.streamBuffer.filter(s => !_stream.eq(s))
        }
      })
      this.streamBuffer.push(stream)
    }
  }

  createStreamMuxer (init?: DataChannelMuxerInit): StreamMuxer {
    return new DataChannelMuxer(this.peerConnection, this.streamBuffer, { ...init, ...this.options }, this.protocol)
  }
}

export type DataChannelMuxerInit = StreamMuxerInit & MessageSizeOption

/**
 * A libp2p data channel stream muxer
 */
export class DataChannelMuxer implements StreamMuxer {
  /**
   * WebRTC Peer Connection
   */
  private readonly peerConnection: RTCPeerConnection

  /**
   * Array of streams in the data channel
   */
  streams: Stream[] = []

  /**
   * Close or abort all tracked streams and stop the muxer
   */
  close: (err?: Error | undefined) => void = () => { }

  /**
   * The stream source, a no-op as the transport natively supports multiplexing
   */
  source: Source<Uint8Array> = nopSource

  /**
   * The stream destination, a no-op as the transport natively supports multiplexing
   */
  sink: Sink<Uint8Array, Promise<void>> = nopSink

  constructor (peerConnection: RTCPeerConnection, streams: Stream[], readonly init: DataChannelMuxerInit, readonly protocol = WEBRTC_PROTOCOL_NAME) {
    /**
     * WebRTC Peer Connection
     */
    this.peerConnection = peerConnection

    /**
     * Fired when a data channel has been added to the connection has been
     * added by the remote peer.
     *
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/datachannel_event}
     */
    this.peerConnection.ondatachannel = ({ channel }) => {
      const stream = new WebRTCStream({
        channel,
        maxMsgSize: init?.maxMsgSize,
        stat: {
          direction: 'inbound',
          timeline: {
            open: 0
          }
        },
        closeCb: this.wrapStreamEnd(init?.onIncomingStream)
      })

      this.streams.push(stream)
      if ((init?.onIncomingStream) != null) {
        init.onIncomingStream(stream)
      }
    }

    // wrap open streams with the onStreamEnd callback
    this.streams = streams
      .filter(stream => stream.stat.timeline.close == null)
      .map(stream => {
        (stream as WebRTCStream).closeCb = this.wrapStreamEnd(init?.onStreamEnd)
        return stream
      })
    const onIncomingStream = init?.onIncomingStream
    if (onIncomingStream != null) {
      this.streams.forEach(s => { onIncomingStream(s) })
    }
  }

  newStream (): Stream {
    // The spec says the label SHOULD be an empty string: https://github.com/libp2p/specs/blob/master/webrtc/README.md#rtcdatachannel-label
    const channel = this.peerConnection.createDataChannel('')
    const stream = new WebRTCStream({
      channel,
      maxMsgSize: this.init?.maxMsgSize,
      stat: {
        direction: 'outbound',
        timeline: {
          open: 0
        }
      },
      closeCb: this.wrapStreamEnd(this.init?.onStreamEnd)
    })
    this.streams.push(stream)

    return stream
  }

  private wrapStreamEnd (onStreamEnd?: (s: Stream) => void): (stream: Stream) => void {
    const self = this
    return (_stream) => {
      self.streams = self.streams.filter(s => !(_stream instanceof WebRTCStream && (_stream).eq(s)))
      if (onStreamEnd != null) {
        onStreamEnd(_stream)
      }
    }
  }
}
