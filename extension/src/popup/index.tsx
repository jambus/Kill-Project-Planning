import { createRoot } from 'react-dom/client';
import '../index.css';

const PopupApp = () => {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-blue-500">快捷操作面板</h2>
      <p className="mt-2 text-sm text-gray-600">研发资源排期系统</p>
      <div className="mt-4">
        <button 
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 w-full"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          打开全局大盘
        </button>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<PopupApp />);
}
