import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import AppError from "./utils/AppError.js"
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";

// Define schemas directly since the model files export compiled models
const propertySchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 255 },
  location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  price: { type: mongoose.Schema.Types.Decimal128, required: true },
  area: { type: Number },
  property_type: { type: String },
  rooms: { type: Number },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  availability_status: { type: String, enum: ['Available', 'Sold', 'Rented'] },
  amenities: { type: mongoose.Schema.Types.Mixed },
  condition: { type: String }
}, {
  timestamps: true
});

const contactSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  full_name: { type: String, required: true, maxlength: 255 },
  preferred_location_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  budget_min: { type: mongoose.Schema.Types.Decimal128 },
  budget_max: { type: mongoose.Schema.Types.Decimal128 },
  property_types: { type: String },
  desired_area_min: { type: Number },
  desired_area_max: { type: Number },
  rooms_min: { type: Number },
  rooms_max: { type: Number },
  amenities: { type: mongoose.Schema.Types.Mixed },
  priority_level: { type: String, enum: ['Low', 'Medium', 'High'] },
  preferred_contact_method: { type: String, enum: ['Phone', 'Email'] }
}, {
  timestamps: true
});

// Add Location schema for population
const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Add other location fields as needed
}, {
  timestamps: true
});


// Global variables
let combineDocsChain;
let contextDocs = [];

// Utilities
function cleanText(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/\s+/g, " ").replace(/\n+/g, " ").trim();
  return cleaned.length > 10 ? cleaned : null;
}
export async function initializeRagFromDb(mongoUri, propId) {
  try {
    console.log("🔌 Connecting to client DB...");

    // Connect to client-specific DB
    const connection = await mongoose.createConnection(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("db connected in success");

    // Create models using the imported schemas
    const Location = connection.model("Location", locationSchema);
    const Property = connection.model("Property", propertySchema);
    const Contact = connection.model("Contact", contactSchema);

    console.log("📦 Fetching property and contacts...");
    const property = await Property.findOne({ _id: propId }).populate("location_id").lean();
    const contacts = await Contact.find().populate("preferred_location_id").lean();
    console.log("♦♦♦♦♦♦♦♦♦♦♦♦♦♦Contacts from db♦♦♦♦♦♦♦♦♦♦♦♦♦♦");
    console.log(contacts);
    console.log("♦♦♦♦♦♦♦♦♦♦♦♦♦♦Property from db♦♦♦♦♦♦♦♦♦♦♦♦♦♦");
    console.log(property);


    if (!property || contacts.length === 0) {
      throw new Error("Missing property or contact data.");
    }

    // Format the property for RAG context
    const propertyText = `
PROPERTY TO MATCH:
Title: ${property.title}
Location: ${property.location_id?.name || "Unknown"}
Price: ${parseFloat(property.price)}
Type: ${property.property_type || "Unknown"}
Area: ${property.area ?? "Unknown"} m²
Rooms: ${property.rooms ?? "Unknown"}
Availability: ${property.availability_status || "Unknown"}
Condition: ${property.condition || "Unknown"}
Amenities: ${JSON.stringify(property.amenities || {})}
`.trim();

    // Format each client
    const clientsText = contacts.map(contact => `
CLIENT: ${contact.full_name}
Preferred Location: ${contact.preferred_location_id?.name || "Unknown"}
Budget: ${parseFloat(contact.budget_min || 0)} - ${parseFloat(contact.budget_max || 0)}
Property Types: ${contact.property_types || "Unknown"}
Area Range: ${contact.desired_area_min ?? "?"} - ${contact.desired_area_max ?? "?"} m²
Rooms: ${contact.rooms_min ?? "?"} - ${contact.rooms_max ?? "?"}
Amenities: ${JSON.stringify(contact.amenities || {})}
Priority Level: ${contact.priority_level}
Contact Method: ${contact.preferred_contact_method}
`.trim()).join('\n\n');

    // Set the context for the AI
    contextDocs = [
      { pageContent: propertyText },
      { pageContent: clientsText }
    ];

    console.log("✅ RAG initialized from DB.");

    await connection.close();

  } catch (err) {
    console.error("❌ Error initializing RAG from DB:", err);
    throw new AppError("Failed to fetch data from client DB", 500);
  }
}

//initialize rag from db bulk
export async function initializeRagFromDbBulk(mongoUri, propIds) {
  try {
    console.log("🔌 Connecting to client DB...");

    // Connect to client-specific DB
    const connection = await mongoose.createConnection(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("db connected in success");

    // Create models using the imported schemas
    const Location = connection.model("Location", locationSchema);
    const Property = connection.model("Property", propertySchema);
    const Contact = connection.model("Contact", contactSchema);

    console.log("📦 Fetching property and contacts...");
    const objectIds = propIds.map(id => new mongoose.Types.ObjectId(id));
    const properties = await Property.find({ _id: { $in: objectIds } })
      .populate("location_id")
      .lean();
    const contacts = await Contact.find().populate("preferred_location_id").lean();
    console.log("♦♦♦♦♦♦♦♦♦♦♦♦♦♦Contacts from db♦♦♦♦♦♦♦♦♦♦♦♦♦♦");
    console.log(contacts);
    console.log("♦♦♦♦♦♦♦♦♦♦♦♦♦♦Properties from db♦♦♦♦♦♦♦♦♦♦♦♦♦♦");
    console.log(properties);


    if (!properties || properties.length === 0 || contacts.length === 0) {
      throw new Error("Missing properties or contact data.");
    }

    // Format all properties for RAG context
    const propertiesText = properties.map(property => `
PROPERTY: ${property.title}
Location: ${property.location_id?.name || "Unknown"}
Price: ${parseFloat(property.price)}
Type: ${property.property_type || "Unknown"}
Area: ${property.area ?? "Unknown"} m²
Rooms: ${property.rooms ?? "Unknown"}
Availability: ${property.availability_status || "Unknown"}
Condition: ${property.condition || "Unknown"}
Amenities: ${JSON.stringify(property.amenities || {})}
`.trim()).join('\n\n');

    // Format each client
    const clientsText = contacts.map(contact => `
CLIENT: ${contact.full_name}
Preferred Location: ${contact.preferred_location_id?.name || "Unknown"}
Budget: ${parseFloat(contact.budget_min || 0)} - ${parseFloat(contact.budget_max || 0)}
Property Types: ${contact.property_types || "Unknown"}
Area Range: ${contact.desired_area_min ?? "?"} - ${contact.desired_area_max ?? "?"} m²
Rooms: ${contact.rooms_min ?? "?"} - ${contact.rooms_max ?? "?"}
Amenities: ${JSON.stringify(contact.amenities || {})}
Priority Level: ${contact.priority_level}
Contact Method: ${contact.preferred_contact_method}
`.trim()).join('\n\n');

    // Set the context for the AI
    contextDocs = [
      { pageContent: propertiesText },
      { pageContent: clientsText }
    ];

    console.log("✅ RAG initialized from DB.");

    await connection.close();

  } catch (err) {
    console.error("❌ Error initializing RAG from DB:", err);
    throw new AppError("Failed to fetch data from client DB", 500);
  }
}

export async function initializeRag(uploadedFile, propertyObject) {
  try {
    console.log("ok1");
    if (!uploadedFile || !uploadedFile.buffer) {
      return new AppError("you did not provide any pdf please provide one", 400)
    }

    // Alternative approach: Create a temporary file-like object
    // Convert buffer to Blob for PDFLoader
    const blob = new Blob([uploadedFile.buffer], { type: 'application/pdf' });
    const loader = new PDFLoader(blob, {
      // Optional: specify PDF parsing options
      splitPages: false
    });

    // Alternative method if Blob doesn't work:
    // You can also try writing to a temporary file and then reading it
    // import fs from 'fs';
    // import path from 'path';
    // import { fileURLToPath } from 'url';
    // const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // const tempPath = path.join(__dirname, 'temp', `${Date.now()}.pdf`);
    // fs.writeFileSync(tempPath, uploadedFile.buffer);
    // const loader = new PDFLoader(tempPath);
    // // Don't forget to clean up: fs.unlinkSync(tempPath);

    const rawDocs = await loader.load();


    // Split and clean text
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 200
    });
    const docChunks = await textSplitter.splitDocuments(rawDocs);
    console.log("ok3");

    const validDocuments = docChunks
      .map(doc => ({ ...doc, pageContent: cleanText(doc.pageContent) }))
      .filter(doc => doc.pageContent !== null);
    console.log("ok4");

    if (validDocuments.length === 0) {
      throw new Error("No valid content found in the document.");
    }

    // 🧠 Merge property info with client profiles into context
    const propertyDescription = `
  PROPERTY TO MATCH:
  Location: ${propertyObject.location}
  Price: ${propertyObject.price}
  Type: ${propertyObject.type}
  Area: ${propertyObject.area} m²
  Rooms: ${propertyObject.rooms}
  `.trim();
    console.log("ok5");

    contextDocs = [
      { pageContent: propertyDescription },
      ...validDocuments
    ];
    console.log(contextDocs);
    console.log("✅ RAG system initialized with property data.");

  } catch (err) {
    console.log(err);
    throw new AppError(err.message, 400); // Use throw instead of next() in this context
  }
}

export async function initializeRagBulk(uploadedFile, propertyObjects) {
  try {
    console.log("ok1 - Bulk initialization");

    // Validate input
    if (!uploadedFile || !uploadedFile.buffer) {
      return new AppError("you did not provide any pdf please provide one", 400)
    }

    if (!propertyObjects || !Array.isArray(propertyObjects) || propertyObjects.length === 0) {
      return new AppError("propertyObjects must be a non-empty array", 400)
    }

    // Alternative approach: Create a temporary file-like object
    // Convert buffer to Blob for PDFLoader
    const blob = new Blob([uploadedFile.buffer], { type: 'application/pdf' });
    const loader = new PDFLoader(blob, {
      // Optional: specify PDF parsing options
      splitPages: false
    });

    const rawDocs = await loader.load();

    // Split and clean text
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 200
    });
    const docChunks = await textSplitter.splitDocuments(rawDocs);
    console.log("ok3");

    const validDocuments = docChunks
      .map(doc => ({ ...doc, pageContent: cleanText(doc.pageContent) }))
      .filter(doc => doc.pageContent !== null);
    console.log("ok4");

    if (validDocuments.length === 0) {
      throw new Error("No valid content found in the document.");
    }

    // 🧠 Merge multiple properties info with client profiles into context
    const propertiesDescription = propertyObjects.map((property, index) => `
PROPERTY ${index + 1}:
Location: ${property.location || "Unknown"}
Price: ${property.price || "Unknown"}
Type: ${property.type || "Unknown"}
Area: ${property.area || "Unknown"} m²
Rooms: ${property.rooms || "Unknown"}
`.trim()).join('\n\n');

    console.log("ok5 - Properties formatted");

    contextDocs = [
      { pageContent: propertiesDescription },
      ...validDocuments
    ];
    console.log("♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦contacts extracted from pdf♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦♦");

    console.log(contextDocs);
    console.log("✅ RAG system initialized with bulk property data.");

  } catch (err) {
    console.log(err);
    throw new AppError(err.message, 400); // Use throw instead of next() in this context
  }
}


function buildPrompt(number = 5) {
  return `
You are an AI assistant helping a real estate agent.

You are given:
1. A list of client profiles (with preferences like location, budget, property type, area, rooms).
2. A single property listing (with features: location, price, type, area, rooms).

Your task is to:
- Analyze the client profiles.
- Recommend the most ${number} relevant clients for this property.
- Provide a match score and explanation for each recommendation.

🔽 Output strictly in the following JSON format:

{{
  "property": {{
    "location": "...",
    "price": ...,
    "type": "...",
    "area": ...,
    "rooms": ...
  }},
  "recommendations": [
    {{
      "clientName": "...",
      "matchScore": 95,
      "reasons": ["Matched location", "Within budget", "Exact room match"]
    }}
  ]
}}

Only use the information in the context. If you are unsure about any value, say "unknown".
Return only valid JSON with double quotes.

Make sure to return the client profiles sorted by matchScore in descending order.
Context: {context}
`.trim();
}

//build prompt for bulk
function buildPromptBulk(number = 5) {
  return `
You are an AI assistant helping a real estate agent.

You are given:
1. A list of client profiles (with preferences like location, budget, property type, area, rooms).
2. A list of property listings (each with features: location, price, type, area, rooms).

Your task is to:
- For **each property**, analyze all client profiles.
- Recommend the top ${number} most relevant clients for **each property**.
- For each recommendation, provide a **matchScore** and a **clear explanation** (reasons) for the match.

🔽 Output strictly in the following JSON format:

{
  "recommendations": [
    {
      "property": {
        "location": "...",
        "price": ...,
        "type": "...",
        "area": ...,
        "rooms": ...
      },
      "topMatches": [
        {
          "clientName": "...",
          "matchScore": 90,
          "reasons": ["Matched location", "Within budget", "Area within range"]
        }
        // Repeat for top ${number} matches
      ]
    }
    // Repeat for each property
  ]
}

🧠 Notes:
- Use **only** the information in the context.
- If you are unsure about any value, return "unknown".
- The matchScore should be a number between 0 and 100.
- Sort clients by **matchScore (descending)** for each property.
- Return **valid JSON** only (double quotes, no trailing commas).

Context: {context}

`.trim();
}

//build prompt for bulk
function buildPromptComparaison(number = 5) {
  return `
You are an intelligent assistant helping a real estate agent compare two properties and generate a final quote.

You will receive:
1. Details of two properties (property A and property B), including location, price, type, area, number of rooms, and any extra features.
2. Optional agent remarks or adjustments (e.g., discounts, commissions, extra charges).
3. The client's name and contact info.

Your task:
- Analyze and compare the two properties.
- Summarize the strengths and weaknesses of each.
- Recommend one property with justification.
- Generate a final quote (price breakdown) for the recommended property.
- Format the response strictly in JSON, ready to be converted to a PDF invoice.

📤 Output JSON format:
{
  "client": {
    "name": "...",
    "email": "...",
    "phone": "..."
  },
  "comparisonSummary": {
    "propertyA": {
      "location": "...",
      "price": ...,
      "type": "...",
      "area": ...,
      "rooms": ...,
      "strengths": ["..."],
      "weaknesses": ["..."]
    },
    "propertyB": {
      "location": "...",
      "price": ...,
      "type": "...",
      "area": ...,
      "rooms": ...,
      "strengths": ["..."],
      "weaknesses": ["..."]
    },
    "recommendedProperty": "A" or "B",
    "justification": "..."
  },
  "finalQuote": {
    "basePrice": ...,
    "discount": ...,
    "agentCommission": ...,
    "totalPrice": ...,
    "currency": "DZD"
  }
}

🔒 Rules:
- Use only the data provided in the context.
- Return valid JSON with double quotes.
- Avoid any additional explanation outside the JSON.
- If any value is missing, use "unknown".

Context:
{context}


`.trim();
}
export async function askQuestion(number = 5) {
  if (!contextDocs || contextDocs.length === 0) {
    throw new Error("❌ RAG system not initialized. Call initializeRag() first.");
  }

  const geminiModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_KEY,
    temperature: 0,
  });

  // Convert contextDocs to proper Document format
  const documents = contextDocs.map(doc => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}
  }));

  try {
    console.log("Invoking chain with documents:", documents.length);

    // Combine all context into a single string
    const contextString = documents.map(doc => doc.pageContent).join('\n\n');

    // Build the complete prompt with context
    const fullPrompt = buildPrompt(number).replace('{context}', contextString);

    console.log("Full prompt length:", fullPrompt);

    // Use the model directly instead of chain
    const result = await geminiModel.invoke([
      { role: "user", content: fullPrompt },
    ]);

    console.log("Model result:", result);
    return result.content || result.text || "⚠️ Unexpected response format.";
  } catch (err) {
    console.error("❌ Error generating answer:", err);
    return "⚠️ I could not generate a response at this time.";
  }
}


//ask question bulk
export async function askQuestionBulk(number = 5) {
  if (!contextDocs || contextDocs.length === 0) {
    throw new Error("❌ RAG system not initialized. Call initializeRag() first.");
  }

  const geminiModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_KEY,
    temperature: 0,
  });

  // Convert contextDocs to proper Document format
  const documents = contextDocs.map(doc => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}
  }));

  try {
    console.log("Invoking chain with documents:", documents.length);

    // Combine all context into a single string
    const contextString = documents.map(doc => doc.pageContent).join('\n\n');

    // Build the complete prompt with context
    const fullPrompt = buildPromptBulk(number).replace('{context}', contextString);

    console.log("Full prompt length:", fullPrompt);

    // Use the model directly instead of chain
    const result = await geminiModel.invoke([
      { role: "user", content: fullPrompt },
    ]);

    console.log("Model result:", result);
    return result.content || result.text || "⚠️ Unexpected response format.";
  } catch (err) {
    console.error("❌ Error generating answer:", err);
    return "⚠️ I could not generate a response at this time.";
  }
}

export async function initializeRagForComparison(propertyA, propertyB, clientInfo, agentRemarks) {
  try {
    console.log("🔧 Initializing RAG for property comparison");

    // Format the two properties for comparison
    const propertyAText = `
PROPERTY A:
Location: ${propertyA.address || "Unknown"}
Price: ${parseFloat(propertyA.price) || "Unknown"}
Type: ${propertyA.property_type || "Unknown"}
Area: ${propertyA.area || "Unknown"} m²
Rooms: ${propertyA.rooms || "Unknown"}
Title: ${propertyA.title || "Unknown"}
Description: ${propertyA.description || "Unknown"}
Amenities: ${JSON.stringify(propertyA.amenities || {})}
Condition: ${propertyA.condition || "Unknown"}
`.trim();

    const propertyBText = `
PROPERTY B:
Location: ${propertyB.address || "Unknown"}
Price: ${parseFloat(propertyB.price) || "Unknown"}
Type: ${propertyB.property_type || "Unknown"}
Area: ${propertyB.area || "Unknown"} m²
Rooms: ${propertyB.rooms || "Unknown"}
Title: ${propertyB.title || "Unknown"}
Description: ${propertyB.description || "Unknown"}
Amenities: ${JSON.stringify(propertyB.amenities || {})}
Condition: ${propertyB.condition || "Unknown"}
`.trim();

    // Format client information
    const clientText = `
CLIENT INFORMATION:
Name: ${clientInfo.full_name || "Unknown"}
Email: ${clientInfo.email || "Unknown"}
Phone: ${clientInfo.phone_number || "Unknown"}
`.trim();

    // Format agent remarks
    const remarksText = `
AGENT REMARKS:
${agentRemarks || "No specific remarks provided"}
`.trim();

    // Set the context for the AI
    contextDocs = [
      { pageContent: propertyAText },
      { pageContent: propertyBText },
      { pageContent: clientText },
      { pageContent: remarksText }
    ];

    console.log("✅ RAG initialized for property comparison.");

  } catch (err) {
    console.error("❌ Error initializing RAG for comparison:", err);
    throw new AppError("Failed to initialize RAG for comparison", 500);
  }
}

export async function askQuestionComparison() {
  if (!contextDocs || contextDocs.length === 0) {
    throw new Error("❌ RAG system not initialized. Call initializeRag() first.");
  }

  const geminiModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_KEY,
    temperature: 0,
  });

  // Convert contextDocs to proper Document format
  const documents = contextDocs.map(doc => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}
  }));

  try {
    console.log("Invoking comparison with documents:", documents.length);

    // Combine all context into a single string
    const contextString = documents.map(doc => doc.pageContent).join('\n\n');

    // Build the complete prompt with context
    const fullPrompt = buildPromptComparaison().replace('{context}', contextString);

    console.log("Full comparison prompt length:", fullPrompt.length);

    // Use the model directly instead of chain
    const result = await geminiModel.invoke([
      { role: "user", content: fullPrompt },
    ]);

    console.log("Comparison result:", result);
    return result.content || result.text || "⚠️ Unexpected response format.";
  } catch (err) {
    console.error("❌ Error generating comparison:", err);
    return "⚠️ I could not generate a comparison at this time.";
  }
}

// Initialize RAG for property recommendations based on user preferences
export async function initializeRagForRecommendations(mongoUri, userId) {
  try {
    console.log("🔌 Connecting to client DB for recommendations...");
    console.log("📋 User ID:", userId);
    console.log("🔗 Mongo URI:", mongoUri ? "Provided" : "Missing");

    // Validate inputs
    if (!mongoUri) {
      throw new Error("MongoDB URI is required");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }

    // Connect to client-specific DB
    const connection = await mongoose.createConnection(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ DB connected successfully");

    // Create models using the imported schemas
    const Location = connection.model("Location", locationSchema);
    const Property = connection.model("Property", propertySchema);
    const Contact = connection.model("Contact", contactSchema);

    console.log("📦 Fetching user contact and available properties...");

    // Validate userId format
    let validUserId;
    try {
      validUserId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      throw new Error(`Invalid user ID format: ${userId}`);
    }

    // Find the user's contact information
    console.log("🔍 Searching for contact with user_id:", validUserId);
    const userContact = await Contact.findOne({ user_id: validUserId }).populate("preferred_location_id").lean();

    if (!userContact) {
      console.log("❌ No contact found for user_id:", validUserId);
      // Let's check if there are any contacts in the database
      const allContacts = await Contact.find().lean();
      console.log("📊 Total contacts in database:", allContacts.length);
      if (allContacts.length > 0) {
        console.log("📋 Available user_ids:", allContacts.map(c => c.user_id));
      }
      throw new Error(`User contact information not found for user_id: ${userId}`);
    }

    console.log("✅ User contact found:", userContact.full_name);

    // Find available properties that match user preferences
    console.log("🔍 Searching for available properties...");
    const availableProperties = await Property.find({
      availability_status: 'Available'
    }).populate("location_id").lean();

    console.log("👤 User Contact:", userContact);
    console.log("🏠 Available Properties:", availableProperties.length);
    console.log("📋 Property Titles:", availableProperties.map(p => p.title));

    // Format user preferences for RAG context
    const userPreferencesText = `
USER PREFERENCES:
Name: ${userContact.full_name}
Preferred Location: ${userContact.preferred_location_id?.name || "Any location"}
Budget Range: ${parseFloat(userContact.budget_min || 0)} - ${parseFloat(userContact.budget_max || 999999999)}
Property Types: ${userContact.property_types || "Any type"}
Area Range: ${userContact.desired_area_min ?? "Any"} - ${userContact.desired_area_max ?? "Any"} m²
Rooms: ${userContact.rooms_min ?? "Any"} - ${userContact.rooms_max ?? "Any"}
Desired Amenities: ${JSON.stringify(userContact.amenities || {})}
Priority Level: ${userContact.priority_level}
Contact Method: ${userContact.preferred_contact_method}
`.trim();

    // Format available properties for RAG context
    const propertiesText = availableProperties.map((property, index) => `
AVAILABLE PROPERTY ${index + 1}:
Title: ${property.title || "Unknown"}
Location: ${property.location_id?.name || "Unknown"}
Price: ${parseFloat(property.price) || "Unknown"}
Type: ${property.property_type || "Unknown"}
Area: ${property.area ?? "Unknown"} m²
Rooms: ${property.rooms ?? "Unknown"}
Condition: ${property.condition || "Unknown"}
Amenities: ${JSON.stringify(property.amenities || {})}
`.trim()).join('\n\n');

    // Set the context for the AI
    contextDocs = [
      { pageContent: userPreferencesText },
      { pageContent: propertiesText }
    ];

    console.log("✅ RAG initialized for recommendations");

    await connection.close();

  } catch (err) {
    console.error("❌ Error initializing RAG for recommendations:", err);
    throw new AppError("Failed to fetch recommendation data", 500);
  }
}

// Build prompt for property recommendations
function buildPromptRecommendations() {
  return `
You are an expert real estate agent helping to recommend properties to clients based on their preferences.

Based on the user preferences and available properties, provide personalized property recommendations.

🔒 Rules:
- Use only the data provided in the context.
- Return valid JSON with double quotes.
- Avoid any additional explanation outside the JSON.
- Use the exact property titles and locations from the available properties list.
- If any value is missing, use "unknown".

Context:
{context}

Please provide:
1. A brief analysis of the user's preferences
2. As many property recommendations as possible that best match their criteria
3. For each recommended property, explain why it's a good match
4. Any suggestions for the user to consider
5. Match scrore for each property based on the user's preferences of 100
6. recommend as many as possible properties
Format your response as a structured JSON with the following structure:
{
  "userAnalysis": {
    "name": "string",
    "preferences": "string",
    "budgetRange": "string"
  },
  "recommendations": [
    {
      "propertyTitle": "string (use exact title from available properties)",
      "location": "string (use exact location from available properties)", 
      "price": "number (use exact price from available properties)",
      "matchScore": "number (1-10)",
      "whyRecommended": "string",
      "keyFeatures": ["string"]
    }
  ],
  "summary": "string"
}

IMPORTANT: Only recommend properties that are actually listed in the available properties section. Use the exact titles, locations, and prices as provided.
`.trim();
}

// Ask AI for property recommendations
export async function askQuestionRecommendations() {
  if (!contextDocs || contextDocs.length === 0) {
    throw new Error("❌ RAG system not initialized. Call initializeRag() first.");
  }

  const geminiModel = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    apiKey: process.env.GEMINI_KEY,
    temperature: 0,
  });

  // Convert contextDocs to proper Document format
  const documents = contextDocs.map(doc => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata || {}
  }));

  try {
    console.log("Invoking recommendations with documents:", documents.length);

    // Combine all context into a single string
    const contextString = documents.map(doc => doc.pageContent).join('\n\n');

    // Build the complete prompt with context
    const fullPrompt = buildPromptRecommendations().replace('{context}', contextString);

    console.log("Full recommendations prompt length:", fullPrompt.length);

    // Use the model directly instead of chain
    const result = await geminiModel.invoke([
      { role: "user", content: fullPrompt },
    ]);

    console.log("Recommendations result:", result);

    // Try to parse the response as JSON
    try {
      let responseText = result.content || result.text;

      console.log("🔍 Raw AI Response:", responseText);

      // Remove markdown code blocks if present
      if (responseText.includes('```json')) {
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }

      console.log("🔍 Cleaned Response:", responseText);

      const jsonResponse = JSON.parse(responseText.trim());
      console.log("✅ Parsed JSON successfully");
      return jsonResponse;
    } catch (parseError) {
      console.log("⚠️ Could not parse JSON, returning raw response");
      console.log("Parse error:", parseError.message);
      console.log("Raw response that failed to parse:", result.content || result.text);
      return { rawResponse: result.content || result.text };
    }
  } catch (err) {
    console.error("❌ Error generating recommendations:", err);
    return "⚠️ I could not generate recommendations at this time.";
  }
}

// Main function to get recommendations for a user
export async function getRecommendationsForUser(userId, mongoUri) {
  try {
    console.log("🎯 Getting recommendations for user:", userId);
    console.log("🔗 Using MongoDB URI:", mongoUri ? "Provided" : "Missing");

    // Initialize RAG with user preferences and available properties
    await initializeRagForRecommendations(mongoUri, userId);

    // Get AI recommendations
    const recommendations = await askQuestionRecommendations();

    console.log("🎯 Final recommendations object:", recommendations);
    console.log("🎯 Recommendations type:", typeof recommendations);

    return recommendations;
  } catch (err) {
    console.error("❌ Error getting recommendations:", err);
    console.error("❌ Error stack:", err.stack);

    // Create a more specific error message
    let errorMessage = "Failed to fetch properties";

    if (err.message.includes("User contact information not found")) {
      errorMessage = `User contact not found: ${err.message}`;
    } else if (err.message.includes("Invalid user ID")) {
      errorMessage = `Invalid user ID: ${err.message}`;
    } else if (err.message.includes("MongoDB URI")) {
      errorMessage = `Database connection error: ${err.message}`;
    } else if (err.message.includes("properties is not defined")) {
      errorMessage = `AI processing error: ${err.message}`;
    } else {
      errorMessage = `${errorMessage}: ${err.message}`;
    }

    throw new Error(errorMessage);
  }
}