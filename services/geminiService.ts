import { GoogleGenAI } from "@google/genai";
import { GameEventContext } from '../types';

const API_KEY = process.env.API_KEY || '';

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

export const generateGameCommentary = async (context: GameEventContext): Promise<string> => {
  if (!ai) return "AI 연결이 설정되지 않았습니다.";

  const model = "gemini-3-flash-preview";
  const prompt = `
    당신은 '지구 부루마블' 보드게임의 재치있는 해설자입니다. 
    세계 여행을 테마로 한 이 게임에서 발생하는 사건에 대해 한국어로 유머러스하게 한 문장 코멘트를 해주세요.
    
    상황: ${context.eventName}
    플레이어: ${context.playerName}
    상세내용: ${context.detail}
    
    가이드라인:
    - 서울, 파리 등 도시 이름이 나오면 그 도시의 특징을 살짝 언급해도 좋습니다.
    - 인수(Takeover) 상황에서는 "뺏고 뺏기는 냉혹한 비즈니스!" 같은 긴장감을 주세요.
    - 파산 위기나 무인도 도착 시에는 유쾌하게 위로하거나 놀려주세요.
    - 더블(Double)이 나오면 신나는 톤으로 반응해주세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text?.trim() || "해설 통신 중...";
  } catch (error) {
    return "해설 로딩 실패";
  }
};