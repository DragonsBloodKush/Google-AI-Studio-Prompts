import React, { useState } from 'react';
import { ASPECT_RATIOS, AspectRatio } from './types';
import { VideoRecorder } from './components/VideoRecorder';
import { Camera, Smartphone, Monitor, Image as ImageIcon, Box } from 'lucide-react';

const App: React.FC = () => {
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio | null>(null);

  if (selectedRatio) {
    return (
      <VideoRecorder 
        dimensions={ASPECT_RATIOS[selectedRatio]} 
        onBack={() => setSelectedRatio(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-pastel-cream flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-4xl w-full text-center space-y-12 animate-fade-in">
        
        <header className="space-y-4">
          <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
            <Camera size={48} className="text-pastel-text" />
          </div>
          <h1 className="text-5xl font-serif text-pastel-text font-bold tracking-tight">
            Pastel Vlog
          </h1>
          <p className="text-xl text-gray-500 max-w-lg mx-auto leading-relaxed">
            Record beautiful video stories with an AI co-host that listens and asks the perfect questions.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((ratio) => {
            const info = ASPECT_RATIOS[ratio];
            let Icon = Smartphone;
            if (ratio === '16:9') Icon = Monitor;
            if (ratio === '1:1') Icon = Box;
            if (ratio === '3:4') Icon = ImageIcon;

            return (
              <button
                key={ratio}
                onClick={() => setSelectedRatio(ratio)}
                className="group relative flex flex-col items-center p-8 bg-white rounded-3xl shadow-sm border-2 border-transparent hover:border-pastel-pink hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2"
              >
                <div className="w-16 h-16 bg-pastel-mint rounded-2xl flex items-center justify-center mb-6 text-emerald-800 group-hover:bg-pastel-pink group-hover:text-pink-900 transition-colors">
                  <Icon size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">{info.label}</h3>
                <span className="text-sm font-mono text-gray-400">{ratio}</span>
                
                {/* Visual Aspect Ratio Preview */}
                <div className="mt-6 bg-gray-100 rounded border border-gray-200" style={{
                  width: '60px',
                  aspectRatio: ratio.replace(':', '/')
                }} />
              </button>
            );
          })}
        </div>
        
        <footer className="text-gray-400 text-sm font-medium">
          Powered by Gemini 2.5 Live API
        </footer>
      </div>
    </div>
  );
};

export default App;
