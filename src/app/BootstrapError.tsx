interface BootstrapErrorProps {
  message: string;
  onRetry: () => void;
}

export function BootstrapError({ message, onRetry }: BootstrapErrorProps) {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background text-foreground">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-lg font-semibold">데이터를 불러오지 못했습니다.</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
