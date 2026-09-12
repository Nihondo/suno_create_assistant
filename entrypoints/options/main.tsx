import { createRoot } from 'react-dom/client';
import '../../src/options/options.css';
import { OptionsApp } from '../../src/options/OptionsApp';

createRoot(document.querySelector('#root')!).render(<OptionsApp />);
