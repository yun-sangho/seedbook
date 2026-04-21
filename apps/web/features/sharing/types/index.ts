/**
 * 데이터 공유 기능의 공용 타입. 서버 API 응답 모양을 그대로 반영한다.
 */

export type SharedAcceptance = {
  id: string;
  acceptedAt: string;
  recipient: {
    id: string;
    name: string;
    image: string | null;
  };
};

export type OwnedShare = {
  id: string;
  code: string;
  label: string | null;
  revokedAt: string | null;
  createdAt: string;
  acceptances: SharedAcceptance[];
};

export type ReceivedShare = {
  id: string;
  shareId: string;
  acceptedAt: string;
  label: string | null;
  owner: {
    id: string;
    name: string;
    image: string | null;
  };
};
