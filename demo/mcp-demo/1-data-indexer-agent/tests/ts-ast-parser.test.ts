import { TypeScriptAstParser } from '../src/parsers/ts-ast-parser';

describe('TypeScriptAstParser', () => {
  let parser: TypeScriptAstParser;

  beforeEach(() => {
    parser = new TypeScriptAstParser();
  });

  it('should correctly extract class names and methods from AST', () => {
    const mockCode = `
      export class TestClass {
        public testMethod() {
          console.log("Hello");
        }
      }
    `;

    const entities = parser.parseSourceCode('test.ts', mockCode);

    expect(entities).toHaveLength(2); // Class 1개, Method 1개
    
    const classEntity = entities.find(e => e.kind === 'CLASS');
    expect(classEntity?.name).toBe('TestClass');
    
    const methodEntity = entities.find(e => e.kind === 'FUNCTION');
    expect(methodEntity?.name).toBe('testMethod');
  });

  it('should not throw errors on empty code', () => {
    const entities = parser.parseSourceCode('empty.ts', '');
    expect(entities).toHaveLength(0);
  });
});
