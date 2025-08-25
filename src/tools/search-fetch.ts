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
  description: "Fetch document content by query or identifier",
  inputSchema: {
    type: "object",
    properties: {
      query: {  // Changed from 'objectIds' array to 'query' string
        type: "string",
        description: "Query to fetch specific document or record ID"
      }
    },
    required: ["query"],
    additionalProperties: false
  }
};

export interface SearchArgs {
  query: string;  // Changed from searchTerm
}

export interface FetchArgs {
  query: string;  // Changed from objectIds array to query string
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
 * Handles fetching complete content for specific documents
 */
export async function handleFetch(conn: any, args: FetchArgs) {
  try {
    const { query } = args;
    
    if (!query || query.trim() === '') {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ 
            documents: [],
            error: "No query provided"
          })
        }],
        isError: true,
      };
    }
    
    // Check if query looks like a Salesforce ID
    const possibleId = query.trim();
    const documents: DocumentResult[] = [];
    
    if (possibleId.length === 15 || possibleId.length === 18) {
      // Treat as record ID
      const validation = validateRecordId(possibleId);
      if (validation.isValid) {
        const objectType = getObjectTypeFromId(possibleId);
        const fieldsToFetch = getDefaultFields(objectType, false);
        
        const soql = `SELECT ${fieldsToFetch.join(', ')} FROM ${objectType} WHERE Id = '${possibleId}'`;
        
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
          console.error(`Error fetching ${possibleId}:`, err);
        }
      }
    } else {
      // Treat as a search query - fetch first few matching records
      const searchObjects = ['Account', 'Contact', 'Lead', 'Opportunity'];
      const searchFields = ['Id', 'Name'];
      
      const soslQuery = `FIND {${query}*} IN ALL FIELDS RETURNING ${searchObjects.map(obj => `${obj}(${searchFields.join(', ')})`).join(', ')} LIMIT 5`;
      
      const searchResults = await conn.search(soslQuery);
      
      for (const objectResult of searchResults) {
        const records = objectResult.records || [];
        for (const record of records.slice(0, 2)) { // Fetch details for first 2 records of each type
          const objectType = record.attributes?.type || 'Unknown';
          const fieldsToFetch = getDefaultFields(objectType, false);
          
          try {
            const soql = `SELECT ${fieldsToFetch.join(', ')} FROM ${objectType} WHERE Id = '${record.Id}'`;
            const result = await conn.query(soql);
            
            if (result.records.length > 0) {
              const fullRecord = result.records[0];
              documents.push({
                id: fullRecord.Id,
                title: fullRecord.Name || `${objectType} Record`,
                content: JSON.stringify(fullRecord),
                metadata: {
                  type: objectType,
                  url: `salesforce://record/${fullRecord.Id}`
                }
              });
            }
          } catch (err) {
            console.error(`Error fetching details for ${record.Id}:`, err);
          }
        }
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