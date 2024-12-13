import React from "react";

const VideoFeeds = ({ localVideoRef, remoteVideoRef, cameraError }) => (
  <div className="floating-video-feeds">
    {cameraError && <div className="error-message">{cameraError}</div>}
    <video
      ref={localVideoRef}
      autoPlay
      playsInline
      muted
      className="local-video"
    />
    <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
  </div>
);

export default VideoFeeds;
