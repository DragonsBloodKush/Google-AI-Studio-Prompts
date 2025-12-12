
import { LogicTreeSchema, CrewMember, WeatherData } from '../types';

export const PLEASURE_LOGIC_TREE: LogicTreeSchema = {
  "version": "1.0",
  "sections": [
    {
      "id": "experience",
      "title": "The Experience",
      "questions": [
        {
          "id": "q_trip_summary",
          "text": "How was the day out on the water? Any highlights?",
          "type": "text",
          "follow_up": {
            "trigger_response": "any",
            "questions": [
              {
                "id": "q_weather_impact",
                "text": "Did the weather behave itself for you?",
                "type": "text"
              }
            ]
          }
        }
      ]
    },
    {
      "id": "crew_guests",
      "title": "Crew & Guests",
      "questions": [
        {
          "id": "q_guest_experience",
          "text": "How were the guests or crew? Everyone happy?",
          "type": "text",
          "follow_up": {
             "trigger_response": "any",
             "questions": [
                {
                   "id": "q_memorable_moment",
                   "text": "Did you catch any memorable moments or photos?",
                   "type": "boolean"
                }
             ]
          }
        }
      ]
    },
    {
      "id": "vessel_check",
      "title": "The Vessel",
      "questions": [
        {
           "id": "q_boat_performance",
           "text": "And the boat? She run smooth today?",
           "type": "boolean",
           "alternate_follow_up": {
              "trigger_response": false,
              "questions": [
                 {
                    "id": "q_boat_issue",
                    "text": "What happened?",
                    "type": "text"
                 }
              ]
           }
        }
      ]
    }
  ]
};

export const COMMERCIAL_LOGIC_TREE: LogicTreeSchema = {
  "version": "1.0",
  "sections": [
    {
      "id": "basics",
      "title": "The Basics",
      "questions": [
        {
          "id": "q_destination_reached",
          "text": "Did you make it to your planned destination today?",
          "type": "boolean",
          "compliance_tag": "navigation_status",
          "follow_up": {
            "trigger_response": true,
            "questions": [
              {
                "id": "q_location_name",
                "text": "Great! Where are we tied up or anchored?",
                "type": "text",
                "placeholder": "e.g., Marina Jack, Sarasota"
              }
            ]
          },
          "alternate_follow_up": {
            "trigger_response": false,
            "questions": [
              {
                "id": "q_deviation_reason",
                "text": "Oh no. Where did you stop, and why the change of plans?",
                "type": "text",
                "compliance_tag": "voyage_deviation"
              }
            ]
          }
        }
      ]
    },
    {
      "id": "mechanics",
      "title": "The Boat",
      "questions": [
        {
          "id": "q_engine_status",
          "text": "Did the engine(s) run perfectly today?",
          "type": "boolean",
          "compliance_tag": "machinery_status",
          "follow_up": {
            "trigger_response": true,
            "questions": [
              {
                "id": "q_engine_hours",
                "text": "Music to my ears. What are the engine hours reading now?",
                "type": "number",
                "units": "hours",
                "compliance_tag": "engine_hours_log"
              }
            ]
          },
          "alternate_follow_up": {
             "trigger_response": false,
             "questions": [
               {
                 "id": "q_engine_issue_desc",
                 "text": "Uh oh. What happened? (Strange noises, overheating, vibrations?)",
                 "type": "text",
                 "compliance_tag": "casualty_report"
               }
             ]
          }
        }
      ]
    },
    {
      "id": "finance",
      "title": "The Wallet",
      "questions": [
        {
          "id": "q_expenses_incurred",
          "text": "Did you spend any money on the boat or the trip today?",
          "type": "boolean",
          "follow_up": {
            "trigger_response": true,
            "questions": [
              {
                "id": "q_expense_category",
                "text": "Let's track it. What was it for?",
                "type": "select",
                "options": ["Fuel", "Dockage", "Repairs", "Gear"],
                "nested_logic": {
                  "Fuel": [
                    { "id": "q_fuel_gallons", "text": "Gallons purchased?", "type": "number" },
                    { "id": "q_fuel_price", "text": "Price per gallon?", "type": "currency" }
                  ],
                  "Repairs": [
                    { "id": "q_repair_desc", "text": "What did you fix?", "type": "text" },
                    { "id": "q_repair_cost", "text": "Total cost?", "type": "currency" }
                  ]
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

export const generateSystemInstruction = (
  isIncidentMode: boolean,
  crew: CrewMember[],
  weather: WeatherData | null
): string => {
  const crewStr = crew.length > 0 
    ? crew.map(c => `${c.name} (${c.role})`).join(', ') 
    : "No crew manifest on file.";

  const weatherStr = weather 
    ? `GPS FIX ACQUIRED: ${weather.location} | Conditions: ${weather.condition}, Temp: ${weather.temperature}°${weather.unit}, Wind: ${weather.windSpeed} knots`
    : "GPS SIGNAL LOST. Weather/Location data unavailable.";

  if (isIncidentMode) {
    return `
      You are a formal Maritime Incident Investigator.
      
      CRITICAL CONTEXT:
      - The user has toggled "INCIDENT MODE". A safety event, accident, or casualty has occurred.
      - POB: ${crewStr}
      - EXTERNAL CONDITIONS: ${weatherStr}

      YOUR PROTOCOL:
      1. Be extremely concise, serious, and objective. No humor.
      2. Ask strictly factual questions required for a USCG Form 2692 or insurance claim.
      3. Your goal is to extract:
         - Exact time of incident.
         - Nature of incident (Grounding, Collision, Fire, Injury, Spill).
         - Injuries (Yes/No, details).
         - Damage assessment.
         - Current status of vessel seaworthiness.
    `;
  }

  // Dual-Mode Logic (Pleasure vs Commercial)
  return `
    You are an intelligent First Mate assisting with the Daily Captain's Log.
    
    VESSEL STATUS:
    - POB: ${crewStr}
    - TELEMETRY & LOCATION: ${weatherStr}

    DATA SOURCES:
    
    [COMMERCIAL_TREE]
    ${JSON.stringify(COMMERCIAL_LOGIC_TREE, null, 2)}

    [PLEASURE_TREE]
    ${JSON.stringify(PLEASURE_LOGIC_TREE, null, 2)}

    YOUR PROCEDURE:

    PHASE 1: DETERMINATION
    1. Start by asking the Captain: "Welcome back, Captain. Was this a Pleasure trip or a Commercial run today?"
    2. Ask if they would like you to remember this preference for future logs.
    3. If they say "Pleasure":
       - Say: "Understood. Relaxed mode engaged. (You can always ask me for commercial questions if you need to log details)."
       - Proceed to PHASE 2 using the [PLEASURE_TREE].
    4. If they say "Commercial":
       - Say: "Aye Captain. Switching to official logging mode."
       - Proceed to PHASE 2 using the [COMMERCIAL_TREE].

    PHASE 2: THE INTERVIEW
    - Follow the structure of the selected Tree.
    - Ask questions one by one.
    - Be professional but conversational.
    - If using [PLEASURE_TREE], keep it light, focus on the experience and memories.
    - If using [COMMERCIAL_TREE], be precise, focus on the facts (Fuel, Hours, Locations).

    IMPORTANT: You have access to the vessel's live GPS and weather data via the 'TELEMETRY' field above. If the user asks where they are, state the location in 'TELEMETRY' clearly.
  `;
};
