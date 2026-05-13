use tracing::{info, warn};

/// 평가 데이터(metrics.jsonl)를 바탕으로 검색 가중치(RRF) 및 프롬프트를 자동/수동으로 조정하는 인터페이스
pub struct ModelTuner {
    pub vector_weight: f32,
    pub bm25_weight: f32,
    pub graph_weight: f32,
}

impl ModelTuner {
    pub fn new() -> Self {
        // 기본 RRF 가중치
        Self {
            vector_weight: 1.0,
            bm25_weight: 1.0,
            graph_weight: 1.5, // 그래프 관계 우선
        }
    }

    pub fn tune_based_on_feedback(&mut self, precision_score: f32, faithfulness_score: f32) {
        if precision_score < 0.7 {
            warn!("[Model Tuner] Context Precision is low ({}). Increasing Keyword (BM25) and Graph weights.", precision_score);
            self.bm25_weight += 0.2;
            self.graph_weight += 0.3;
        }

        if faithfulness_score < 0.8 {
            warn!("[Model Tuner] Faithfulness is low ({}). Hallucination detected! Adjusting System Prompt strictly.", faithfulness_score);
            // 실제 구현에서는 프롬프트 템플릿의 {temperature}를 낮추거나, 가드레일을 강화하는 설정 적용
        }

        info!("Updated Weights - Vector: {}, BM25: {}, Graph: {}", self.vector_weight, self.bm25_weight, self.graph_weight);
    }
}
