from flask import Flask, render_template, jsonify, session, request
import json
import random
from pathlib import Path
import requests
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev')  # For session management

# AI/ML API configuration
API_URL = "https://api.ai-ml.org/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {os.getenv('AI_ML_API_KEY')}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def query_ai_ml(prompt, system_message):
    try:
        response = requests.post(
            API_URL,
            headers=headers,
            json={
                "model": "gpt-4-mini",
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 150,
                "temperature": 0.7
            },
            timeout=10
        )
        if response.status_code == 200:
            return response.json()['choices'][0]['message']['content']
        else:
            print(f"Error from AI/ML API: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except requests.exceptions.Timeout:
        print("Timeout while connecting to AI/ML API")
        return None
    except requests.exceptions.ConnectionError:
        print("Connection error while connecting to AI/ML API")
        return None
    except Exception as e:
        print(f"Error querying AI/ML API: {e}")
        return None

# Load dish data
def load_dishes():
    try:
        with open('dishes.json', 'r', encoding='utf-8') as f:
            dishes = json.load(f)
            print(f"Successfully loaded {len(dishes)} dishes from dishes.json")
            return dishes
    except FileNotFoundError:
        print("Error: dishes.json file not found")
        return []
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in dishes.json: {str(e)}")
        return []
    except Exception as e:
        print(f"Error loading dishes.json: {str(e)}")
        return []

def get_recommendations(liked_dishes):
    if not liked_dishes:
        return []
    
    try:
        all_dishes = load_dishes()
        # Create a list of all available dish names for the AI to choose from
        available_dishes = [d for d in all_dishes if d not in liked_dishes]
        available_dish_names = [d["name"] for d in available_dishes]
        
        # Create a prompt that includes the available dishes
        liked_dishes_str = ", ".join([d["name"] for d in liked_dishes])
        available_dishes_str = "\n".join(available_dish_names)
        
        prompt = f"""Based on the user liking these dishes: {liked_dishes_str}

Here are the available dishes to recommend from (choose 3):
{available_dishes_str}

Analyze their taste preferences and recommend 3 dishes from the available list that they might enjoy.
Consider cuisine types, spice levels, and flavor profiles.
Return only the dish names, one per line."""

        response = query_ai_ml(
            prompt,
            "You are a culinary expert helping with food recommendations. Choose only from the provided list of dishes. Return exactly 3 dish names, one per line."
        )
        
        if not response:
            return get_rule_based_recommendations(liked_dishes)
        
        # Clean up the response and get dish names
        recommended_names = [name.strip() for name in response.strip().split("\n") if name.strip()]
        
        # Get the full dish objects for the recommended names
        recommendations = [d for d in available_dishes if d["name"] in recommended_names]
        
        # If we got fewer than 3 recommendations, fill with rule-based ones
        if len(recommendations) < 3:
            rule_based = get_rule_based_recommendations(liked_dishes)
            # Add rule-based recommendations that aren't already in the list
            for dish in rule_based:
                if dish not in recommendations and len(recommendations) < 3:
                    recommendations.append(dish)
        
        return recommendations[:3]
    except Exception as e:
        print(f"Error getting recommendations: {e}")
        return get_rule_based_recommendations(liked_dishes)

def get_rule_based_recommendations(liked_dishes):
    all_dishes = load_dishes()
    recommendations = []
    
    # Get average preferences from liked dishes
    avg_spicy = sum(d["spicy"] for d in liked_dishes) / len(liked_dishes)
    avg_sweet = sum(d["sweet"] for d in liked_dishes) / len(liked_dishes)
    avg_creamy = sum(d["creamy"] for d in liked_dishes) / len(liked_dishes)
    
    # Get preferred cuisines
    preferred_cuisines = {}
    for dish in liked_dishes:
        cuisine = dish["cuisine"]
        preferred_cuisines[cuisine] = preferred_cuisines.get(cuisine, 0) + 1
    
    # Sort cuisines by preference
    sorted_cuisines = sorted(preferred_cuisines.items(), key=lambda x: x[1], reverse=True)
    
    # Find similar dishes based on metrics and cuisine
    for dish in all_dishes:
        if dish not in liked_dishes:
            # Calculate similarity score
            spicy_diff = abs(dish["spicy"] - avg_spicy)
            sweet_diff = abs(dish["sweet"] - avg_sweet)
            creamy_diff = abs(dish["creamy"] - avg_creamy)
            
            # Check if cuisine matches
            cuisine_match = dish["cuisine"] in [c[0] for c in sorted_cuisines[:2]]
            
            # Calculate total similarity score (lower is better)
            similarity_score = (spicy_diff + sweet_diff + creamy_diff) / 3
            
            if similarity_score < 0.3 or (cuisine_match and similarity_score < 0.4):
                recommendations.append(dish)
    
    return recommendations[:3]

def analyze_taste_profile(liked_dishes):
    if not liked_dishes:
        return None
    
    try:
        # Calculate average preferences
        spicy = sum(d["spicy"] for d in liked_dishes) / len(liked_dishes)
        sweet = sum(d["sweet"] for d in liked_dishes) / len(liked_dishes)
        creamy = sum(d["creamy"] for d in liked_dishes) / len(liked_dishes)
        
        # Get cuisine preferences
        cuisines = [d["cuisine"] for d in liked_dishes]
        liked_dishes_str = ", ".join([d["name"] for d in liked_dishes])
        
        prompt = f"""Based on the user's preferences and liked dishes:
        Liked dishes: {liked_dishes_str}
        Spiciness: {spicy:.1f}/1.0
        Sweetness: {sweet:.1f}/1.0
        Creaminess: {creamy:.1f}/1.0
        Favorite cuisines: {", ".join(cuisines)}

        Create a fun, personalized foodie tag (max 3 words) and a brief analysis (2-3 sentences) of their taste profile.
        Format your response exactly like this:
        TAG: [your fun foodie tag here]
        ANALYSIS: [your analysis here]"""

        response = query_ai_ml(
            prompt,
            "You are a creative culinary expert who creates fun, memorable foodie tags and insightful taste profile analyses. Keep it light and engaging."
        )
        
        if not response:
            return get_basic_analysis(spicy, sweet, creamy, cuisines)
        
        # Parse the response
        try:
            tag_line = response.split('\n')[0]
            analysis_line = response.split('\n')[1]
            
            foodie_tag = tag_line.replace('TAG:', '').strip()
            analysis_text = analysis_line.replace('ANALYSIS:', '').strip()
        except:
            return get_basic_analysis(spicy, sweet, creamy, cuisines)
        
        return {
            "analysis": analysis_text,
            "metrics": {
                "spicy": round(spicy, 2),
                "sweet": round(sweet, 2),
                "creamy": round(creamy, 2)
            },
            "cuisines": cuisines,
            "foodie_type": foodie_tag
        }
    except Exception as e:
        print(f"Error analyzing taste profile: {e}")
        return get_basic_analysis(spicy, sweet, creamy, cuisines)

def get_basic_analysis(spicy, sweet, creamy, cuisines):
    """Fallback function for basic analysis when AI/ML API fails"""
    foodie_type = determine_foodie_type(spicy, sweet, creamy)
    # Remove duplicate cuisines and join with commas
    unique_cuisines = list(dict.fromkeys(cuisines))
    cuisine_str = ", ".join(unique_cuisines)
    
    analysis = f"You're a {foodie_type.lower()} who enjoys {cuisine_str} cuisine. "
    analysis += f"Your taste buds prefer {int(spicy*100)}% spiciness, {int(sweet*100)}% sweetness, and {int(creamy*100)}% creaminess."
    
    return {
        "analysis": analysis,
        "metrics": {
            "spicy": round(spicy, 2),
            "sweet": round(sweet, 2),
            "creamy": round(creamy, 2)
        },
        "cuisines": unique_cuisines,  # Use unique cuisines in the response
        "foodie_type": foodie_type
    }

def determine_foodie_type(spicy, sweet, creamy):
    if spicy > 0.7:
        return "Spice Lover"
    elif sweet > 0.7:
        return "Sweet Tooth"
    elif creamy > 0.7:
        return "Creamy Connoisseur"
    else:
        return "Balanced Foodie"

@app.route('/')
def home():
    # Clear the session when the app starts
    session.clear()
    session['liked_dishes'] = []
    return render_template('index.html')

@app.route('/random-dish')
def random_dish():
    try:
        dishes = load_dishes()
        if not dishes:
            print("No dishes available in dishes.json")
            return jsonify({"error": "No dishes available", "status": "error"}), 500
            
        liked_dishes = session.get('liked_dishes', [])
        liked_dish_names = [d["name"] for d in liked_dishes]
        
        # Filter out already liked dishes
        available_dishes = [d for d in dishes if d["name"] not in liked_dish_names]
        
        if not available_dishes:
            print("No more dishes available (all have been liked)")
            # Reset the session when all dishes have been liked
            session.clear()
            session['liked_dishes'] = []
            available_dishes = dishes  # Reset to all dishes
            
        selected_dish = random.choice(available_dishes)
        print(f"Returning random dish: {selected_dish['name']} (Total dishes: {len(dishes)}, Available: {len(available_dishes)}, Liked: {len(liked_dishes)})")
        return jsonify({"status": "success", "dish": selected_dish})
    except Exception as e:
        print(f"Error in random_dish route: {str(e)}")
        return jsonify({"error": "Failed to get random dish", "status": "error"}), 500
    
@app.route('/like/<dish_name>')
def like_dish(dish_name):
    dishes = load_dishes()
    liked_dish = next((d for d in dishes if d["name"] == dish_name), None)
    if liked_dish:
        if 'liked_dishes' not in session:
            session['liked_dishes'] = []
        session['liked_dishes'].append(liked_dish)
        session.modified = True
        
        # Get recommendations and analysis if we have enough liked dishes
        if len(session['liked_dishes']) >= 3:
            recommendations = get_recommendations(session['liked_dishes'])
            analysis = analyze_taste_profile(session['liked_dishes'])
            return jsonify({
                "status": "success",
                "message": f"Liked {dish_name}",
                "recommendations": recommendations,
                "analysis": analysis
            })
    
    return jsonify({"status": "success", "message": f"Liked {dish_name}"})

@app.route('/profile')
def get_profile():
    liked_dishes = session.get('liked_dishes', [])
    if not liked_dishes:
        return jsonify({"error": "No dishes liked yet"})
    
    analysis = analyze_taste_profile(liked_dishes)
    recommendations = get_recommendations(liked_dishes)
    
    return jsonify({
        "liked_dishes": liked_dishes,
        "analysis": analysis,
        "recommendations": recommendations
    })

@app.route('/test-api')
def test_api():
    try:
        response = requests.get(
            "https://api.ai-ml.org/api/v1/models",
            headers=headers,
            timeout=10
        )
        return jsonify({
            "status": "success" if response.status_code == 200 else "error",
            "status_code": response.status_code,
            "response": response.text
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        })

if __name__ == '__main__':
    app.run(debug=True)
