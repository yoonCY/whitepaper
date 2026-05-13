import { AstParser } from './ast-parser-interface';
import { TypeScriptAstParser } from './ts-ast-parser';
import { PhpAstParser } from './php-ast-parser';
import { JavaAstParser } from './java-ast-parser';
import * as path from 'path';

export class ParserFactory {
  static getParserForFile(fileName: string): AstParser | null {
    const ext = path.extname(fileName).toLowerCase();
    
    switch (ext) {
      case '.ts':
      case '.js':
        return new TypeScriptAstParser();
      case '.php':
        return new PhpAstParser();
      case '.java':
        return new JavaAstParser();
      default:
        return null; // 지원하지 않는 확장자는 파싱 생략 (BM25 전문검색용으로만 사용)
    }
  }
}
