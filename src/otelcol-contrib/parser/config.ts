import { ConfigSchema, ConfigField } from '../types.js';

/**
 * Parses Go struct fields from a string content.
 * @param structContent The content of the struct to parse
 * @returns Array of parsed config fields
 */
export function parseStructFields(structContent: string): ConfigField[] {
    const fields: ConfigField[] = [];
    const lines = structContent.split('\n');
    let currentComment = '';
    let currentStructContent = '';
    let inNestedStruct = false;
    let nestedBraceCount = 0;
    let nestedFieldComment = '';

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip empty lines
        if (!trimmedLine) continue;

        // Collect comments
        if (trimmedLine.startsWith('//')) {
            if (inNestedStruct) {
                nestedFieldComment = trimmedLine.substring(2).trim();
            } else {
                currentComment = (currentComment + ' ' + trimmedLine.substring(2).trim()).trim();
            }
            continue;
        }

        // Handle nested structs
        const structMatch = trimmedLine.match(/^(\w+)\s+struct\s*{/);
        if (structMatch) {
            inNestedStruct = true;
            nestedBraceCount = 1;
            currentStructContent = trimmedLine;
            continue;
        }

        if (inNestedStruct) {
            if (nestedFieldComment && !trimmedLine.includes('}')) {
                currentStructContent += '\n// ' + nestedFieldComment;
                nestedFieldComment = '';
            }
            currentStructContent += '\n' + trimmedLine;
            nestedBraceCount += (trimmedLine.match(/{/g) || []).length;
            nestedBraceCount -= (trimmedLine.match(/}/g) || []).length;
            
            if (nestedBraceCount === 0) {
                inNestedStruct = false;
                const fieldMatch = currentStructContent.match(/^(\w+)\s+struct\s*{([\s\S]*?)}\s*`?(?:mapstructure:"([^"]*)")?`?/);
                if (fieldMatch) {
                    const [_, name, nestedContent, mapstructureTag] = fieldMatch;
                    fields.push({
                        name,
                        type: 'struct',
                        description: currentComment,
                        required: !mapstructureTag?.includes('omitempty'),
                        mapstructureTag,
                        nestedSchema: {
                            fields: parseStructFields(nestedContent),
                            imports: [],
                            packageName: ''
                        }
                    });
                }
                currentStructContent = '';
                currentComment = '';
                nestedFieldComment = '';
            }
            continue;
        }

        // Parse regular field
        const fieldMatch = trimmedLine.match(/^(\w+)\s+([^`]+)\s*`?(?:mapstructure:"([^"]*)")?`?/);
        if (fieldMatch && !inNestedStruct) {
            const [_, name, type, mapstructureTag] = fieldMatch;
            fields.push({
                name,
                type: type.trim(),
                description: currentComment,
                required: !mapstructureTag?.includes('omitempty'),
                mapstructureTag,
                nestedSchema: undefined
            });
            currentComment = '';
        }
    }

    return fields;
}

/**
 * Parses a Go config file content into a ConfigSchema.
 * @param content The content of the Go config file
 * @returns Parsed config schema or undefined if parsing fails
 */
export function parseConfigSchema(content: string): ConfigSchema | undefined {
    try {
        // Extract package name
        const packageMatch = content.match(/package\s+(\w+)/);
        if (!packageMatch) return undefined;
        const packageName = packageMatch[1];

        // Validate basic Go file structure
        if (!content.includes('type Config struct')) {
            return undefined;
        }

        // Extract imports
        const importsMatch = content.match(/import\s*\(([\s\S]*?)\)/);
        const imports = importsMatch ? importsMatch[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('//'))
            .map(line => line.replace(/^"(.*)"$/, '$1'))
            : [];

        // Find the main Config struct
        const configMatch = content.match(/type\s+Config\s+struct\s*{([\s\S]*?)}/);
        if (!configMatch) return undefined;

        const fields = parseStructFields(configMatch[1]);
        
        // Validate that we have valid fields and they follow expected patterns
        if (fields.length === 0) return undefined;
        
        // Check if any field has invalid structure
        const hasInvalidField = fields.some(field => {
            // Check for basic field validity
            if (!field.name || !field.type) return true;
            
            // Check for valid Go identifiers
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) return true;
            
            // Check for common Go types or custom types
            const validTypes = ['string', 'int', 'bool', 'float64', 'struct'];
            if (!validTypes.includes(field.type) && !field.type.includes('.')) return true;
            
            return false;
        });

        if (hasInvalidField) return undefined;

        return {
            fields,
            imports,
            packageName
        };
    } catch (error) {
        console.warn('Failed to parse config schema:', error);
        return undefined;
    }
} 