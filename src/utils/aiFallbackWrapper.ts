/**
 * AI Service Wrapper & Client Interface
 * Provides centralized types and helpers for communicating with the secure backend AI Fallback endpoints.
 */

export interface AiTextGenerationRequest {
  userPrompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface AiTextGenerationResponse {
  success: boolean;
  text?: string;
  engine?: string;
  error?: string;
}

export interface AiVisionExtractionRequest {
  imageBase64: string;
  mimeType?: string;
  prompt?: string;
}
