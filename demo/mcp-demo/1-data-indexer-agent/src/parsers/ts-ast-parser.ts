import * as ts from 'typescript';
import { AstParser, AstParsedEntity } from './ast-parser-interface';

export class TypeScriptAstParser implements AstParser {
  /**
   * 소스코드 문자열을 받아 클래스, 함수 등의 엔티티를 추출합니다.
   */
  public parseSourceCode(fileName: string, sourceCode: string): AstParsedEntity[] {
    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const entities: AstParsedEntity[] = [];

    const visit = (node: ts.Node) => {
      // 1. 클래스 추출
      if (ts.isClassDeclaration(node) && node.name) {
        entities.push({
          name: node.name.text,
          kind: 'CLASS',
          startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        });
      }
      
      // 2. 함수/메서드 추출
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        entities.push({
          name: node.name.text,
          kind: 'FUNCTION',
          startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return entities;
  }
}
