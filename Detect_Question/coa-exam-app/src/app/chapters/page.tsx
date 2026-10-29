'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChaptersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-slate-500 font-medium">Đang chuyển hướng về Trang chủ...</div>
    </div>
  );
}

