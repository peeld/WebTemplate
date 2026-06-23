import { useNavigate } from 'react-router-dom';

import DropZone from '../components/DropZone.jsx';

export default function UploadPage() {
  const navigate = useNavigate();

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: '640px' }}>
        <h1 className="title">Upload File</h1>
        <p className="subtitle">Files are uploaded directly to secure storage.</p>
        <DropZone onUploadComplete={() => navigate('/files')} />
      </div>
    </section>
  );
}
