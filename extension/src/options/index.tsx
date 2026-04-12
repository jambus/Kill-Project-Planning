import { createRoot } from 'react-dom/client';
import '../index.css';

const OptionsApp = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">全局仪表盘 (Dashboard)</h1>
      <p className="mt-4 text-gray-600">Welcome to Intelligent Resource Planner Options Page.</p>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<OptionsApp />);
}
