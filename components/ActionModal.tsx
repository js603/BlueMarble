import { type FC } from 'react';
import { ModalState } from '../types';

interface ActionModalProps {
  modal: ModalState;
  onAction: (confirmed: boolean) => void;
}

export const ActionModal: FC<ActionModalProps> = ({ modal, onAction }) => {
  if (!modal.isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className={`w-full max-w-sm bg-white rounded-xl shadow-2xl overflow-hidden transform transition-all scale-100 border-4 ${modal.type === 'SELL' ? 'border-red-500' : 'border-emerald-500'}`}>
        <div className={`${modal.type === 'SELL' ? 'bg-red-500' : 'bg-emerald-500'} p-4 text-center`}>
          <h3 className="text-xl font-black text-white uppercase tracking-wider shadow-sm">{modal.title}</h3>
        </div>

        <div className="p-6 text-center">
          <p className="text-gray-700 mb-4 whitespace-pre-wrap font-medium">{modal.message}</p>

          {modal.cost !== undefined && (
            <div className={`mb-6 p-2 rounded-lg border ${modal.type === 'SELL' ? 'bg-red-50 border-red-200' : 'bg-yellow-100 border-yellow-300'}`}>
              <span className="text-xs text-gray-500 block">{modal.type === 'SELL' ? '매각 예상 금액' : '필요 비용'}</span>
              <span className={`text-2xl font-bold ${modal.type === 'SELL' ? 'text-red-600' : 'text-yellow-600'}`}>
                ₩ {modal.cost.toLocaleString()}
              </span>
            </div>
          )}

          {modal.isComputerAction && (
            <div className="text-sm text-emerald-600 font-bold animate-pulse mb-4">
              🤖 AI가 고민 중입니다...
            </div>
          )}

          <div className="flex gap-3">
            {modal.type === 'INFO' ? (
              <button
                onClick={() => onAction(true)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-lg"
              >
                확인
              </button>
            ) : (
              <>
                <button
                  onClick={() => onAction(false)}
                  disabled={modal.isComputerAction}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={() => onAction(true)}
                  disabled={modal.isComputerAction}
                  className={`flex-1 py-3 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105 ${modal.type === 'SELL'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                    }`}
                >
                  {modal.type === 'SELL' ? '매각' : '승인'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};