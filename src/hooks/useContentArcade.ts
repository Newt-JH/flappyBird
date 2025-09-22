/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';

interface ChildSDK {
  init(): void;
  destroy(): void;
  on(event: string, handler: (payload: any) => void): void;
  off(event: string, handler: (payload: any) => void): void;
  lifecycleLoaded(): void;
  lifecycleStarted(): void;
  lifecycleEnded(payload: { result: 'success' | 'fail'; reason?: string; difficulty?: number }): void;
  visibilityChanged(payload: { visible: boolean }): void;
  reportError(payload: { code: string; message: string; detail?: any }): void;
  adShow(): Promise<{ ok: boolean }>;
  openUrl(payload: { href: string; target?: '_blank' | '_self' }): Promise<{ ok: boolean }>;
  getUserInfo(): Promise<{ ok: boolean; data?: { name?: string } }>;
}

interface ContentArcade {
  createChildSDK(opts?: {
    allowedParent?: string | ((origin: string) => boolean);
    requestTimeoutMs?: number;
    ackTimeoutMs?: number;
  }): ChildSDK;
}

declare global {
  interface Window {
    ContentArcade?: ContentArcade;
  }
}

export const useContentArcade = () => {
  const [sdk, setSdk] = useState<ChildSDK | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userInfo, setUserInfo] = useState<{ name?: string } | null>(null);
  const [rewards, setRewards] = useState<Array<{ amount: number; currency: string }>>([]);
  const [adState, setAdState] = useState<'idle' | 'requested' | 'playing' | 'completed'>('idle');
  const [pauseRequested, setPauseRequested] = useState(false);

  const initializeSDK = async () => {
    try {
      // SDK 로드 (script 태그 방식)
      if (!window.ContentArcade) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = 'https://s.treasurecomics.com/gamearcade/content-arcade-1.0.0.esm.min.js';
          script.onload = () => {
            // ESM으로 로드된 경우 window.ContentArcade에 할당되는지 확인
            setTimeout(resolve, 100);
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // UMD 방식으로 접근
      if (!window.ContentArcade) {
        // UMD 버전 로드 시도
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://s.treasurecomics.com/gamearcade/content-arcade-1.0.0.umd.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      if (!window.ContentArcade) {
        throw new Error('ContentArcade SDK 로드 실패');
      }

      const childSDK = window.ContentArcade.createChildSDK({
        allowedParent: (origin: string) => {
          // 로컬 테스트 + 배포 환경 설정
          const hostname = new URL(origin).hostname.toLowerCase();
          return hostname === 'localhost' ||
                 hostname === '127.0.0.1' ||
                 hostname === 'treasurecomics.com' ||
                 hostname.endsWith('.treasurecomics.com') ||
                 hostname.endsWith('.vercel.app') ||
                 hostname.endsWith('.amazonaws.com') ||
                 hostname.endsWith('.s3.amazonaws.com') ||
                 hostname.endsWith('.s3-website.amazonaws.com') ||
                 hostname.endsWith('.s3-website-us-east-1.amazonaws.com') ||
                 hostname.endsWith('.cloudfront.net');
        },
        requestTimeoutMs: 6000,
        ackTimeoutMs: 3000,
      });

      // 이벤트 리스너 등록
      childSDK.on('AdStarted', () => {
        console.log('🎬 광고 시작 - 게임 일시정지');
        setAdState('playing');
        setPauseRequested(true);
      });

      childSDK.on('AdCompleted', () => {
        console.log('✅ 광고 완료');
        setAdState('completed');
      });

      childSDK.on('AdClosed', () => {
        console.log('🚪 광고 닫힘 - 게임 재개');
        setAdState('idle');
        setPauseRequested(false);
      });

      childSDK.on('RewardGranted', (payload) => {
        console.log('💰 보상 획득:', payload);
        setRewards(prev => [...prev, payload]);

        // 광고 보상 후 게임 재시작 트리거
        if ((window as any).flappyGameRestartAfterAd) {
          (window as any).flappyGameRestartAfterAd();
        }
      });

      childSDK.on('LifecyclePaused', () => {
        console.log('⏸️ 게임 일시정지 요청');
        setPauseRequested(true);
      });

      childSDK.on('LifecycleResumed', () => {
        console.log('▶️ 게임 재개 요청');
        setPauseRequested(false);
      });

      // SDK 초기화
      console.log('🔧 SDK 초기화 시작');
      childSDK.init();
      childSDK.lifecycleLoaded();
      console.log('📡 lifecycleLoaded 이벤트 전송됨');

      setSdk(childSDK);
      setIsConnected(true);

      // window에도 SDK 인스턴스 저장 (즉시 접근 가능하도록)
      (window as any).flappyBirdSDK = childSDK;
      console.log('✅ SDK 초기화 완료 및 연결 상태 설정됨');

      // 사용자 정보 요청
      try {
        const userResult = await childSDK.getUserInfo();
        if (userResult.ok && userResult.data) {
          setUserInfo(userResult.data);
        }
      } catch (error) {
        console.log('사용자 정보 요청 실패:', error);
      }

    } catch (error) {
      console.error('SDK 초기화 실패:', error);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeSDK();
    }

    return () => {
      if (sdk) {
        sdk.destroy();
      }
    };
  }, []);

  // 가시성 변경 감지
  useEffect(() => {
    const handleVisibilityChange = () => {
      const currentSDK = sdk || (window as any).flappyBirdSDK;
      if (currentSDK) {
        currentSDK.visibilityChanged({ visible: !document.hidden });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sdk]);

  // API 메서드들
  const startGame = () => {
    // SDK 인스턴스를 window에서 직접 가져오기
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      currentSDK.lifecycleStarted();
      console.log('🎮 게임 시작 알림 전송됨');
    } else {
      console.warn('🎮 게임 시작 알림 실패: SDK가 연결되지 않음', { sdkState: !!sdk, windowSDK: !!(window as any).flappyBirdSDK });
    }
  };

  const endGame = (success: boolean, score?: number) => {
    // SDK 인스턴스를 window에서 직접 가져오기
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      // 점수에 따른 난이도 계산 (예시)
      let difficulty = 1;
      if (score) {
        if (score >= 100) difficulty = 5;
        else if (score >= 50) difficulty = 4;
        else if (score >= 20) difficulty = 3;
        else if (score >= 10) difficulty = 2;
      }

      currentSDK.lifecycleEnded({
        result: success ? 'success' : 'fail',
        reason: success ? 'completed' : 'collision',
        difficulty
      });
      console.log('🏁 게임 종료 알림 전송됨:', { success, score, difficulty });
    } else {
      console.warn('🏁 게임 종료 알림 실패: SDK가 연결되지 않음', { sdkState: !!sdk, windowSDK: !!(window as any).flappyBirdSDK });
    }
  };

  const showAd = async (adPlacementName: string = 'RV') => {
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK && adState === 'idle') {
      try {
        setAdState('requested');
        const result = await currentSDK.adShow({ placement: adPlacementName });
        console.log('📺 광고 요청 결과:', result, '지면:', adPlacementName);
        return result.ok;
      } catch (error) {
        console.error('광고 요청 실패:', error);
        setAdState('idle');
        return false;
      }
    }
    return false;
  };

  const reportError = (code: string, message: string, detail?: any) => {
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      currentSDK.reportError({ code, message, detail });
      console.log('❌ 에러 보고:', { code, message });
    }
  };

  const notifyPause = () => {
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      currentSDK.visibilityChanged({ visible: false });
      console.log('⏸️ 게임 일시정지 상태 알림');
    }
  };

  const notifyResume = () => {
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      currentSDK.visibilityChanged({ visible: true });
      console.log('▶️ 게임 재개 상태 알림');
    }
  };

  const openNewWindow = async () => {
    const currentSDK = sdk || (window as any).flappyBirdSDK;
    if (currentSDK) {
      try {
        // 부모에게 새 창 열기 요청 (특별한 URL로 구분)
        const result = await currentSDK.openUrl({
          href: 'parent://new-window', // 부모창 새 창 열기 요청
          target: '_blank'
        });
        console.log('🪟 부모에게 새 창 열기 요청 결과:', result);
        return result.ok;
      } catch (error) {
        console.error('새 창 열기 요청 실패:', error);
        return false;
      }
    } else {
      console.warn('🪟 새 창 열기 실패: SDK가 연결되지 않음');
      return false;
    }
  };

  return {
    sdk,
    isConnected,
    userInfo,
    rewards,
    adState,
    pauseRequested,
    startGame,
    endGame,
    showAd,
    reportError,
    notifyPause,
    notifyResume,
    openNewWindow
  };
};