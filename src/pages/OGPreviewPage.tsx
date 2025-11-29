
/**
 * OG 이미지 생성을 위한 전용 페이지
 * 로고만 깔끔하게 보여주는 간단한 페이지
 */
export default function OGPreviewPage() {
  return (
    <div 
      className="w-full h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, hsl(240, 60%, 55%) 0%, hsl(240, 60%, 65%) 100%)',
      }}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="w-80 h-80 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl border-4 border-white/20">
          <img
            src="/poro_logo.png"
            alt="Poro Logo"
            className="w-full h-full object-contain p-8"
          />
        </div>
      </div>
    </div>
  );
}

