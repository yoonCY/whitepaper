import { AstParser, AstParsedEntity } from './ast-parser-interface';

export class JavaAstParser implements AstParser {
  public parseSourceCode(fileName: string, sourceCode: string): AstParsedEntity[] {
    // 실제 운영 시 `java-parser` 패키지 사용
    // 데모용 정규식 Fallback 파서
    const entities: AstParsedEntity[] = [];
    const lines = sourceCode.split('\n');

    lines.forEach((line, index) => {
      if (line.includes('class ')) {
        const match = line.match(/class\s+(\w+)/);
        if (match) entities.push({ name: match[1], kind: 'CLASS', startLine: index + 1, endLine: index + 15 });
      } else if (line.match(/(public|private|protected)\s+\w+\s+(\w+)\s*\(/)) {
        const match = line.match(/(public|private|protected)\s+\w+\s+(\w+)\s*\(/);
        if (match) entities.push({ name: match[2], kind: 'FUNCTION', startLine: index + 1, endLine: index + 8 });
      }
    });

    return entities;
  }
}
