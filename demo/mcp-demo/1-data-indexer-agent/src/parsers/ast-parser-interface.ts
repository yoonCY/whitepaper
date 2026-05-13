export interface AstParsedEntity {
  name: string;
  kind: 'CLASS' | 'FUNCTION' | 'INTERFACE';
  startLine: number;
  endLine: number;
}

export interface AstParser {
  /**
   * 언어별 소스 코드를 분석하여 AST 기반 엔티티를 추출합니다.
   */
  parseSourceCode(fileName: string, sourceCode: string): AstParsedEntity[];
}
