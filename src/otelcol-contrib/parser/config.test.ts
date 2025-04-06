import { parseConfigSchema, parseStructFields } from './config.js';

describe('Config Schema Parsing', () => {
    describe('parseStructFields', () => {
        it('should parse basic struct fields', () => {
            const input = `
                // Field1 is a string field
                Field1 string \`mapstructure:"field1"\`
                // Field2 is an integer field
                Field2 int \`mapstructure:"field2,omitempty"\`
            `;
            
            const result = parseStructFields(input);
            
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                name: 'Field1',
                type: 'string',
                description: 'Field1 is a string field',
                required: true,
                mapstructureTag: 'field1',
                nestedSchema: undefined
            });
            expect(result[1]).toEqual({
                name: 'Field2',
                type: 'int',
                description: 'Field2 is an integer field',
                required: false,
                mapstructureTag: 'field2,omitempty',
                nestedSchema: undefined
            });
        });

        it('should handle nested structs', () => {
            const input = `
                // NestedConfig contains nested configuration
                NestedConfig struct {
                    // InnerField is a string
                    InnerField string \`mapstructure:"inner_field"\`
                } \`mapstructure:"nested_config"\`
            `;
            
            const result = parseStructFields(input);
            
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('NestedConfig');
            expect(result[0].nestedSchema).toBeDefined();
            expect(result[0].nestedSchema?.fields).toHaveLength(1);
            expect(result[0].nestedSchema?.fields[0]).toEqual({
                name: 'InnerField',
                type: 'string',
                description: 'InnerField is a string',
                required: true,
                mapstructureTag: 'inner_field',
                nestedSchema: undefined
            });
        });

        it('should handle fields without mapstructure tags', () => {
            const input = `
                // SimpleField is a simple field
                SimpleField string
            `;
            
            const result = parseStructFields(input);
            
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                name: 'SimpleField',
                type: 'string',
                description: 'SimpleField is a simple field',
                required: true,
                mapstructureTag: undefined,
                nestedSchema: undefined
            });
        });

        it('should handle multiple comments for a field', () => {
            const input = `
                // First comment
                // Second comment
                MultiCommentField string \`mapstructure:"multi_comment"\`
            `;
            
            const result = parseStructFields(input);
            
            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('First comment Second comment');
        });
    });

    describe('parseConfigSchema', () => {
        it('should parse a complete config file', () => {
            const input = `
                package mypackage

                import (
                    "github.com/example/pkg1"
                    "github.com/example/pkg2"
                )

                type Config struct {
                    // Field1 is a string field
                    Field1 string \`mapstructure:"field1"\`
                    // Field2 is an integer field
                    Field2 int \`mapstructure:"field2,omitempty"\`
                }
            `;
            
            const result = parseConfigSchema(input);
            
            expect(result).toBeDefined();
            expect(result?.packageName).toBe('mypackage');
            expect(result?.imports).toEqual([
                'github.com/example/pkg1',
                'github.com/example/pkg2'
            ]);
            expect(result?.fields).toHaveLength(2);
            expect(result?.fields[0].name).toBe('Field1');
            expect(result?.fields[1].name).toBe('Field2');
        });

        it('should handle config file without imports', () => {
            const input = `
                package mypackage

                type Config struct {
                    Field1 string \`mapstructure:"field1"\`
                }
            `;
            
            const result = parseConfigSchema(input);
            
            expect(result).toBeDefined();
            expect(result?.packageName).toBe('mypackage');
            expect(result?.imports).toEqual([]);
            expect(result?.fields).toHaveLength(1);
        });

        it('should return undefined for invalid Go code', () => {
            const invalidInputs = [
                'invalid go code',
                'package mypackage\n\ninvalid struct',
                'package mypackage\n\ntype Config struct { invalid field}',
            ];

            invalidInputs.forEach(input => {
                const result = parseConfigSchema(input);
                expect(result).toBeUndefined();
            });
        });
    });
}); 