export function Messages() {
  return (
    <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-14">
      <div className="mb-8">
        <p className="label-kicker mb-3">You</p>
        <h1 className="font-display text-4xl">Messages</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Direct notes from other builders.</p>
      </div>
      <div className="ob-panel p-10 text-center">
        <p className="text-[var(--muted)]">Nothing here yet.</p>
        <p className="text-sm text-[var(--muted)] mt-2">When someone reaches out, it’ll land here.</p>
      </div>
    </div>
  );
}
