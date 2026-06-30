export default function ReleaseNotes({ notes }) {
  if (!notes) return null;
  const lines = notes.split('\n').filter(l => l.trim() !== '');
  return (
    <div>
      {lines.map((line, i) => (
        <p key={i} className="mb-2">{line}</p>
      ))}
    </div>
  );
}
