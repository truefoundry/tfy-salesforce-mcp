import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const SEARCH: Tool = {
  name: "search",
  description: `Search across multiple Salesforce objects using SOSL (Salesforce Object Search Language).

Examples:
1. Basic search across all searchable objects:
   {
     "searchTerm": "John Smith"
   }

2. Search with specific object scope:
   {
     "searchTerm": "Acme Corp",
     "objects": ["Account", "Contact", "Opportunity"]
   }

3. Search with field specifications:
   {
     "searchTerm": "john@example.com",
     "objects": ["Contact"],
     "fields": ["Id", "Name", "Email", "Phone"]
   }

4. Search with limits and divisions:
   {
     "searchTerm": "Technology",
     "objects": ["Account", "Lead"],
     "limit": 50,
     "divisionFilter": "Global"
   }

5. Advanced search with WHERE conditions:
   {
     "searchTerm": "Manager",
     "objects": ["Contact"],
     "whereClause": "Account.Type = 'Customer'"
   }

Notes:
- SOSL searches across text fields, names, and email addresses
- Search terms are automatically wrapped with wildcards for partial matching
- Default objects searched: Account, Contact, Lead, Opportunity if none specified
- Maximum 200 records returned per object by default
- Use exact field API names in the fields array`,
  inputSchema: {
    type: "object",
    properties: {
      searchTerm: {
        type: "string",
        description: "The text to search for across Salesforce objects"
      },
      objects: {
        type: "array",
        items: { type: "string" },
        description: "Specific objects to search within (optional)"
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Specific fields to return (optional, defaults to Id and Name)"
      },
      whereClause: {
        type: "string",
        description: "Additional WHERE conditions for filtering results (optional)"
      },
      limit: {
        type: "number",
        description: "Maximum number of records to return per object (default: 200, max: 2000)"
      },
      divisionFilter: {
        type: "string",
        description: "Filter results by division (optional)"
      }
    },
    required: ["searchTerm"]
  }
};

export const FETCH: Tool = {
  name: "fetch",
  description: `Fetch a specific Salesforce record by ID with detailed field information.

Examples:
1. Basic record fetch:
   {
     "recordId": "003000000000001AAA"
   }

2. Fetch with specific fields:
   {
     "recordId": "001000000000001AAA",
     "fields": ["Name", "Industry", "Phone", "BillingAddress"]
   }

3. Fetch with relationship fields:
   {
     "recordId": "003000000000001AAA",
     "fields": ["Name", "Email", "Account.Name", "Account.Industry", "Owner.Name"]
   }

4. Fetch all available fields:
   {
     "recordId": "006000000000001AAA",
     "includeAllFields": true
   }

5. Fetch with system fields included:
   {
     "recordId": "001000000000001AAA",
     "includeSystemFields": true
   }

Notes:
- Record ID can be either 15 or 18 character Salesforce ID
- If no fields specified, returns Id, Name, and common fields based on object type
- Relationship fields use dot notation (e.g., "Account.Name")
- System fields include CreatedDate, LastModifiedDate, CreatedBy, etc.
- Custom fields end with "__c" (e.g., "CustomField__c")`,
  inputSchema: {
    type: "object",
    properties: {
      recordId: {
        type: "string",
        description: "The Salesforce record ID (15 or 18 characters)"
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description: "Specific fields to retrieve (optional)"
      },
      includeAllFields: {
        type: "boolean",
        description: "Whether to include all available fields for the record",
        default: false
      },
      includeSystemFields: {
        type: "boolean",
        description: "Whether to include system audit fields",
        default: false
      }
    },
    required: ["recordId"]
  }
};

export interface SearchArgs {
  searchTerm: string;
  objects?: string[];
  fields?: string[];
  whereClause?: string;
  limit?: number;
  divisionFilter?: string;
}

export interface FetchArgs {
  recordId: string;
  fields?: string[];
  includeAllFields?: boolean;
  includeSystemFields?: boolean;
}

/**
 * Validates Salesforce record ID format
 */
function validateRecordId(recordId: string): { isValid: boolean; error?: string } {
  if (!recordId || typeof recordId !== 'string') {
    return { isValid: false, error: 'Record ID is required and must be a string' };
  }

  // Remove any whitespace
  recordId = recordId.trim();

  // Check length (15 or 18 characters)
  if (recordId.length !== 15 && recordId.length !== 18) {
    return { 
      isValid: false, 
      error: 'Record ID must be either 15 or 18 characters long' 
    };
  }

  // Check format (alphanumeric)
  if (!/^[a-zA-Z0-9]+$/.test(recordId)) {
    return { 
      isValid: false, 
      error: 'Record ID contains invalid characters. Only alphanumeric characters are allowed' 
    };
  }

  return { isValid: true };
}

/**
 * Gets the object type from a record ID
 */
function getObjectTypeFromId(recordId: string): string {
  // Salesforce record IDs start with a 3-character prefix that indicates the object type
  const prefix = recordId.substring(0, 3);
  
  // Common prefixes (this is a subset - Salesforce has many more)
  const prefixMap: { [key: string]: string } = {
    '001': 'Account',
    '003': 'Contact',
    '00Q': 'Lead',
    '006': 'Opportunity',
    '500': 'Case',
    '00T': 'Task',
    '00U': 'Event',
    '005': 'User',
    '00G': 'Group',
    '01Z': 'Dashboard',
    '00O': 'Report'
  };
  
  return prefixMap[prefix] || 'Unknown';
}

/**
 * Gets default fields based on object type
 */
function getDefaultFields(objectType: string, includeSystemFields: boolean = false): string[] {
  const baseFields = ['Id', 'Name'];
  const systemFields = ['CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById'];
  
  const objectSpecificFields: { [key: string]: string[] } = {
    'Account': ['Industry', 'Phone', 'Website', 'BillingCity'],
    'Contact': ['Email', 'Phone', 'Account.Name', 'Title'],
    'Lead': ['Email', 'Phone', 'Company', 'Status'],
    'Opportunity': ['Account.Name', 'StageName', 'Amount', 'CloseDate'],
    'Case': ['Subject', 'Status', 'Priority', 'Contact.Name'],
    'User': ['Email', 'Username', 'Profile.Name', 'IsActive']
  };
  
  let fields = [...baseFields];
  
  if (objectSpecificFields[objectType]) {
    fields.push(...objectSpecificFields[objectType]);
  }
  
  if (includeSystemFields) {
    fields.push(...systemFields);
  }
  
  return fields;
}

/**
 * Handles Salesforce search using SOSL
 */
export async function handleSearch(conn: any, args: SearchArgs) {
  try {
    const { searchTerm, objects, fields, whereClause, limit, divisionFilter } = args;

    // Default objects to search if none provided
    const searchObjects = objects && objects.length > 0 
      ? objects 
      : ['Account', 'Contact', 'Lead', 'Opportunity'];

    // Default fields if none provided
    const searchFields = fields && fields.length > 0 
      ? fields 
      : ['Id', 'Name'];

    // Build SOSL query
    let soslQuery = `FIND {${searchTerm}*} IN ALL FIELDS RETURNING `;
    
    const objectClauses = searchObjects.map(obj => {
      let clause = `${obj}(${searchFields.join(', ')})`;
      if (whereClause) {
        clause = `${obj}(${searchFields.join(', ')} WHERE ${whereClause})`;
      }
      return clause;
    });

    soslQuery += objectClauses.join(', ');

    // Add limit if specified
    if (limit && limit > 0) {
      soslQuery += ` LIMIT ${Math.min(limit, 2000)}`; // Max 2000 per SOSL limits
    }

    // Add division filter if specified
    if (divisionFilter) {
      soslQuery += ` WITH DIVISION = '${divisionFilter}'`;
    }

    console.error(`Executing SOSL: ${soslQuery}`);
    
    const searchResults = await conn.search(soslQuery);
    
    if (!searchResults || searchResults.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No records found matching "${searchTerm}"`
        }],
        isError: false,
      };
    }

    // Format results by object type
    let totalRecords = 0;
    const formattedResults = searchResults.map((objectResult: any) => {
      const records = objectResult.records || [];
      totalRecords += records.length;
      
      if (records.length === 0) return null;

      const objectName = records[0].attributes?.type || 'Unknown';
      const recordsStr = records.map((record: any, index: number) => {
        const fieldStr = searchFields.map(field => {
          if (field.includes('.')) {
            // Handle relationship fields
            const [relationship, ...rest] = field.split('.');
            const relatedRecord = record[relationship];
            return `    ${field}: ${relatedRecord ? relatedRecord[rest.join('.')] : 'null'}`;
          }
          return `    ${field}: ${record[field] !== undefined ? record[field] : 'null'}`;
        }).join('\n');
        return `  Record ${index + 1} (${record.Id}):\n${fieldStr}`;
      }).join('\n\n');

      return `${objectName} (${records.length} records):\n${recordsStr}`;
    }).filter((result: any) => result !== null);

    return {
      content: [{
        type: "text",
        text: `Search found ${totalRecords} records matching "${searchTerm}":\n\n${formattedResults.join('\n\n')}`
      }],
      isError: false,
    };

  } catch (error) {
    console.error('Error executing search:', error);
    return {
      content: [{
        type: "text",
        text: `Error executing search: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
    };
  }
}

/**
 * Handles fetching a specific Salesforce record by ID
 */
export async function handleFetch(conn: any, args: FetchArgs) {
  try {
    const { recordId, fields, includeAllFields, includeSystemFields } = args;

    // Validate record ID
    const validation = validateRecordId(recordId);
    if (!validation.isValid) {
      return {
        content: [{
          type: "text",
          text: validation.error!
        }],
        isError: true,
      };
    }

    const cleanRecordId = recordId.trim();

    // First, get the object type by querying the record
    let objectType: string;
    try {
      // Try to get object type from ID prefix first
      objectType = getObjectTypeFromId(cleanRecordId);
      
      // If unknown, query to get the actual object type
      if (objectType === 'Unknown') {
        const typeResult = await conn.query(`SELECT Id FROM sobject WHERE Id = '${cleanRecordId}'`);
        if (typeResult.records.length > 0) {
          objectType = typeResult.records[0].attributes.type;
        } else {
          throw new Error('Record not found');
        }
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Record not found or inaccessible: ${cleanRecordId}`
        }],
        isError: true,
      };
    }

    // Determine fields to fetch
    let fieldsToFetch: string[];
    
    if (includeAllFields) {
      // Get all fields for the object
      try {
        const describe = await conn.sobject(objectType).describe();
        fieldsToFetch = describe.fields
          .filter((field: any) => field.type !== 'base64') // Exclude binary fields
          .map((field: any) => field.name);
      } catch (error) {
        // Fallback to default fields if describe fails
        fieldsToFetch = getDefaultFields(objectType, includeSystemFields);
      }
    } else if (fields && fields.length > 0) {
      fieldsToFetch = [...fields];
      if (includeSystemFields) {
        fieldsToFetch.push('CreatedDate', 'LastModifiedDate', 'CreatedById', 'LastModifiedById');
      }
    } else {
      fieldsToFetch = getDefaultFields(objectType, includeSystemFields);
    }

    // Remove duplicates and ensure Id is included
    fieldsToFetch = [...new Set(['Id', ...fieldsToFetch])];

    // Build and execute query
    const soql = `SELECT ${fieldsToFetch.join(', ')} FROM ${objectType} WHERE Id = '${cleanRecordId}'`;
    
    console.error(`Executing SOQL: ${soql}`);
    
    const result = await conn.query(soql);
    
    if (result.records.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No record found with ID: ${cleanRecordId}`
        }],
        isError: true,
      };
    }

    const record = result.records[0];
    
    // Format the output
    const formattedFields = fieldsToFetch.map(field => {
      if (field.includes('.')) {
        // Handle relationship fields
        const [relationship, ...rest] = field.split('.');
        const relatedRecord = record[relationship];
        return `  ${field}: ${relatedRecord ? relatedRecord[rest.join('.')] : 'null'}`;
      }
      
      let value = record[field];
      
      // Format different field types appropriately
      if (value === null || value === undefined) {
        value = 'null';
      } else if (typeof value === 'boolean') {
        value = value.toString();
      } else if (value instanceof Date) {
        value = value.toISOString();
      }
      
      return `  ${field}: ${value}`;
    }).join('\n');

    return {
      content: [{
        type: "text",
        text: `${objectType} Record (${cleanRecordId}):\n${formattedFields}`
      }],
      isError: false,
    };

  } catch (error) {
    console.error('Error fetching record:', error);
    
    // Enhanced error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    let enhancedError = errorMessage;

    if (errorMessage.includes('INVALID_FIELD')) {
      enhancedError = `Invalid field in query. Please check that all specified fields exist and are accessible.`;
    } else if (errorMessage.includes('MALFORMED_ID')) {
      enhancedError = `Invalid record ID format: ${args.recordId}`;
    }

    return {
      content: [{
        type: "text",
        text: `Error fetching record: ${enhancedError}`
      }],
      isError: true,
    };
  }
}