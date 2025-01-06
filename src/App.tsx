import { useEffect, useRef, useState } from 'react';
import './App.css';
import "webrtc-adapter";
import Janus from "janus-gateway";

function App() {
  const localVideoRef = useRef<any>(null);
  const janusInstanceRef = useRef<any>(null);
  const pluginHandleRef = useRef<any>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const roomId = 1234; // Example room ID

  const createRoom = () => {
    janusInstanceRef.current = new Janus({
      server: "ws://localhost:8188",
      success: () => {
        janusInstanceRef.current.attach({
          plugin: "janus.plugin.videoroom",
          success: (pluginHandle) => {
            pluginHandleRef.current = pluginHandle;

            // Join as a publisher
            const joinMessage = {
              request: "joinandconfigure",
              room: roomId,
              ptype: "publisher",
              display: "Publisher",
            };
            pluginHandle.send({ message: joinMessage });
          },
          error: (err) => console.error("Error attaching plugin:", err),
          onmessage: (msg, jsep) => {
            if (msg.videoroom === "joined") {
              // Successfully joined the room
              navigator.mediaDevices
                .getUserMedia({ video: true, audio: true })
                .then((stream) => {
                  if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                  }
                  pluginHandleRef.current.createOffer({
                    media: { audioSend: true, videoSend: true },
                    stream,
                    success: (jsep) => {
                      const publishMessage = {
                        request: "configure",
                        audio: true,
                        video: true,
                      };
                      pluginHandleRef.current.send({
                        message: publishMessage,
                        jsep,
                      });

                      msg.publishers.forEach((publisher) => {
                        console.log("calledagain")
                        newRemoteFeed(publisher.id);
                      });
                    },
                    error: (err) => console.error("Create offer error:", err),
                  });
                })
                .catch((err) => console.error("Media devices error:", err));
            }

            // Handle new publishers
            if (msg.videoroom === "event" && msg.publishers) {
              msg.publishers.forEach((publisher) => {
                console.log("new guy in town")
                newRemoteFeed(publisher.id);
              });
            }

            if (jsep) {
              pluginHandleRef.current.handleRemoteJsep({ jsep });
            }
          },
        });
      },
      error: (err) => console.error("Janus error:", err),
      destroyed: () => console.log("Janus instance destroyed"),
    });
  };

  const newRemoteFeed = (feedId) => {
    let plugin;
    janusInstanceRef.current.attach({
      plugin: "janus.plugin.videoroom",
      success: (pluginHandle) => {
        plugin = pluginHandle;
        const subscribeMessage = {
          request: "join",
          room: roomId,
          ptype: "subscriber",
          feed: feedId,
        };
        pluginHandle.send({ message: subscribeMessage });
      },
      error: (err) => console.error("Error attaching remote feed:", err),
      onmessage: (msg, jsep) => {
        if (jsep && msg.videoroom === "attached") {
          plugin.createAnswer({
            jsep,
            media: { audioSend: false, videoSend: false },
            success: (jsepAnswer) => {
              const configureMessage = {
                request: "start",
              };
              plugin.send({
                message: configureMessage,
                jsep: jsepAnswer,
              });
            },
            error: (err) => console.error("Create answer error:", err),
          });
        }
      },
      onremotetrack: (track, mid, added) => {
        if (added && track.kind === "video") {
          setRemoteStreams((prev) => {
            const newStreams = new Map(prev);
            if (!newStreams.has(feedId)) {
              newStreams.set(feedId, new MediaStream([track]));
            } else {
              const existingStream = newStreams.get(feedId);
              const tracks = existingStream?.getVideoTracks() || [];
              if (!tracks.some((existingTrack) => existingTrack.id === track.id)) {
                existingStream?.addTrack(track);
              }
            }
            return newStreams;
          });
        }
      },
    });
  };

  useEffect(() => {
    Janus.init({
      debug: "all",
      callback: () => console.log("Janus initialized"),
    });
  }, []);

  return (
    <div  style={{width:'100%'}}>
      <h1>Video Room</h1>
      <video ref={localVideoRef} autoPlay muted  width={200} />
      <div className='' style={{display:'flex', }}>
        {[...remoteStreams.values()].map((stream, index) => (
          <video
            style={{margin:"10px 10px"}}
            width={90}
            key={index}
            autoPlay
            ref={(el) => {
              if (el && !el.srcObject) {
                el.srcObject = stream; // Attach the MediaStream
              }
            }}
          />
        ))}
      </div>
      <button onClick={createRoom}>Start Video Room</button>
    </div>
  );
}

export default App;
