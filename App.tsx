import React from 'react';
import { VideoRecorder } from './components/VideoRecorder';

const App: React.FC = () => {
  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#141218] text-[#E6E1E5]">
      {/* 
        To integrate this into another project:
        1. Copy the components, hooks, utils, and types.ts.
        2. Pass your Google AI Studio API Key as a prop:
        <VideoRecorder apiKey={process.env.YOUR_OTHER_PROJECT_API_KEY} />
      */}
      <VideoRecorder apiKey={process.env.API_KEY} />
    </div>
  );
};

export default App;
