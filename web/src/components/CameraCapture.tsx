import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface Props {
  onCapture: (imageDataUrl: string) => void;
  onQrScan?: (text: string) => void;
  onClose: () => void;
  overlayText?: string;
  /** When set, the captured frame is decoded as a QR code instead of returned as a photo. */
  scanQr?: boolean;
}

/**
 * Camera capture used for profile photos, community snaps and attendance QR
 * scanning. QR decoding happens on-device (jsQR) so no image ever leaves the
 * phone; a manual code entry fallback covers devices without a working camera.
 */
export const CameraCapture = ({ onCapture, onQrScan, onClose, overlayText, scanQr }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        } catch {
          setCameraError(
            scanQr
              ? 'Camera unavailable — enter the code your lecturer showed you.'
              : 'Camera unavailable on this device.',
          );
          return;
        }
      }
      if (videoRef.current) videoRef.current.srcObject = stream;
    };
    void start();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanQr]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (scanQr && onQrScan) {
      setDecoding(true);
      setDecodeError(null);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      setDecoding(false);
      if (code?.data) {
        onQrScan(code.data.trim());
      } else {
        setDecodeError('No QR code detected. Hold the code inside the frame and try again.');
      }
      return;
    }

    onCapture(canvas.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {!cameraError && <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />}
        {overlayText && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-2 border-white/50 rounded-xl relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-ksitmo -mt-1 -ml-1" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-ksitmo -mt-1 -mr-1" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-ksitmo -mb-1 -ml-1" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-ksitmo -mb-1 -mr-1" />
            </div>
            <p className="absolute bottom-20 text-white font-bold bg-black/50 px-4 py-1 rounded-full">{overlayText}</p>
          </div>
        )}
        {cameraError && (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📵</div>
            <p className="text-white text-sm font-bold">{cameraError}</p>
          </div>
        )}
        {decodeError && !cameraError && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            {decodeError}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <button
          onClick={onClose}
          className="absolute top-6 right-6 bg-black/50 text-white p-2 rounded-full backdrop-blur-md z-10"
          aria-label="Close camera"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="bg-black/80 p-6 flex flex-col items-center gap-4 pb-10">
        {!cameraError && (
          <button
            onClick={takePhoto}
            disabled={decoding}
            className="w-20 h-20 rounded-full border-4 border-white p-1 flex items-center justify-center group active:scale-95 transition-transform disabled:opacity-50"
          >
            <div className="w-full h-full bg-white rounded-full group-active:bg-gray-200 flex items-center justify-center text-2xl">
              {decoding ? <span className="text-xs text-black font-bold">…</span> : null}
            </div>
          </button>
        )}
        {scanQr && (
          <div className="w-full max-w-xs">
            <p className="text-[10px] uppercase tracking-wider text-white/60 text-center mb-2">Or type the class code</p>
            <div className="flex gap-2">
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-center font-mono tracking-widest uppercase outline-none focus:border-ksitmo"
              />
              <button
                disabled={manualCode.trim().length < 4 || !onQrScan}
                onClick={() => onQrScan?.(manualCode.trim())}
                className="bg-ksitmo text-white text-xs font-bold px-4 rounded-lg disabled:opacity-50"
              >
                Mark
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
