import { createRoot } from 'react-dom/client';

console.log('Content script loaded on Jira.');

const container = document.createElement('div');
container.id = 'irp-content-root';
document.body.appendChild(container);

const ContentApp = () => {
  return (
    <div style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 9999, background: 'green', color: 'white', padding: '5px', borderRadius: '4px', fontSize: '12px' }}>
      IRP Content Script Active
    </div>
  );
};

const root = createRoot(container);
root.render(<ContentApp />);
