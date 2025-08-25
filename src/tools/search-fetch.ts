import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const SEARCH: Tool = {
  name: "search",
  description: "Search for documents using keywords. Returns a list of search results with basic information.",
  inputSchema: {
    type: "object",
    properties: {
      query: {  // Changed from 'searchTerm' to 'query'
        type: "string",
        description: "Search query string. Natural language queries work best."
      }
    },
    required: ["query"],
    additionalProperties: false  // Add this to enforce strict schema
  }
};

export const FETCH: Tool = {
  name: "fetch",
  description: "Fetch complete content for specific documents by their IDs.",
  inputSchema: {
    type: "object",
    properties: {
      objectIds: {  // Changed to match expected pattern
        type: "array",
        items: { type: "string" },
        description: "Array of object IDs to fetch"
      }
    },
    required: ["objectIds"],
    additionalProperties: false  // Add this to enforce strict schema
  }
};

export interface SearchArgs {
  query: string;  // Changed from searchTerm
}

export interface FetchArgs {
  objectIds: string[];  // Changed from single recordId to array
}

interface SearchResult {
  id: string;
  title: string;
  text: string;
  url: string;
}

interface DocumentResult {
  id: string;
  title: string;
  content: string;
  metadata: {
    type: string;
    url: string;
  };
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
 * Handles document search using keywords
 */
export async function handleSearch(conn: any, args: SearchArgs) {
  try {
    const { query } = args;
    
    // Your existing search logic, but use 'query' instead of 'searchTerm'
    const searchTerm = query;  // Map to your existing variable
    
    // Default objects to search
    const searchObjects = ['Account', 'Contact', 'Lead', 'Opportunity'];
    const searchFields = ['Id', 'Name'];
    
    // Build SOSL query
    let soslQuery = `FIND {${searchTerm}*} IN ALL FIELDS RETURNING `;
    
    const objectClauses = searchObjects.map(obj => {
      return `${obj}(${searchFields.join(', ')})`;
    });
    
    soslQuery += objectClauses.join(', ');
    soslQuery += ` LIMIT 200`;
    
    const searchResults = await conn.search(soslQuery);
    
    // Format results to match expected structure
    const results: SearchResult[] = [];
    searchResults.forEach((objectResult: any) => {
      const records = objectResult.records || [];
      records.forEach((record: any) => {
        results.push({
          id: record.Id,
          title: record.Name || `${record.attributes?.type} Record`,
          text: `${record.attributes?.type}: ${record.Name || record.Id}`,
          url: `salesforce://record/${record.Id}`  // Optional URL field
        });
      });
    });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ results })  // Return structured JSON
      }],
      isError: false,
    };
    
  } catch (error) {
    console.error('Error executing search:', error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ 
          results: [],
          error: error instanceof Error ? error.message : String(error)
        })
      }],
      isError: true,
    };
  }
}

/**
 * Handles fetching complete content for specific documents by their IDs
 */
export async function handleFetch(conn: any, args: FetchArgs) {
  try {
    const { objectIds } = args;
    
    if (!objectIds || objectIds.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ 
            documents: [],
            error: "No object IDs provided"
          })
        }],
        isError: true,
      };
    }
    
    const documents: DocumentResult[] = [];
    
    for (const recordId of objectIds) {
      // Your existing fetch logic for each ID
      const cleanRecordId = recordId.trim();
      const objectType = getObjectTypeFromId(cleanRecordId);
      const fieldsToFetch = getDefaultFields(objectType, false);
      
      const soql = `SELECT ${fieldsToFetch.join(', ')} FROM ${objectType} WHERE Id = '${cleanRecordId}'`;
      
      try {
        const result = await conn.query(soql);
        if (result.records.length > 0) {
          const record = result.records[0];
          documents.push({
            id: record.Id,
            title: record.Name || `${objectType} Record`,
            content: JSON.stringify(record),
            metadata: {
              type: objectType,
              url: `salesforce://record/${record.Id}`
            }
          });
        }
      } catch (err) {
        console.error(`Error fetching ${recordId}:`, err);
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ documents })
      }],
      isError: false,
    };
    
  } catch (error) {
    console.error('Error fetching records:', error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ 
          documents: [],
          error: error instanceof Error ? error.message : String(error)
        })
      }],
      isError: true,
    };
  }
}