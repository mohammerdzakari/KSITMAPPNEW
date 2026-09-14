import { useState } from 'react';
import { LOGO_FALLBACK, LOGO_URL } from '../lib/constants';

/**
 * Institute logo. The hosted image is kept for brand fidelity, but if it cannot
 * be reached (offline install, hotlink protection) the component swaps in a
 * local badge so the header never shows a broken image.
 */
export const Logo = ({ className = 'w-10 h-10', alt = 'KSITM' }: { className?: string; alt?: string }) => {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? LOGO_FALLBACK : LOGO_URL}
      onError={() => {
        if (!failed) setFailed(true);
      }}
      className={className}
      alt={alt}
    />
  );
};

export default Logo;
