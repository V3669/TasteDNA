let currentDish = null;
let isAnimating = false;
let likedDishesCount = 0;
let dishCache = [];

// Initialize HammerJS for swipe
const stack = document.getElementById('card-stack');
const hammer = new Hammer(stack);

// Configure Hammer.js with better settings
hammer.get('swipe').set({ 
    direction: Hammer.DIRECTION_ALL,
    threshold: 0.2,
    velocity: 0.2,
    touchAction: 'pan-y pinch-zoom'
});

// Button elements
const likeButton = document.getElementById('like');
const dislikeButton = document.getElementById('dislike');

// Error handling function
function showError(message) {
    if (!stack) return;
    stack.innerHTML = `
        <div class="flex items-center justify-center h-full w-full">
            <div class="error-message bg-red-100 text-red-800 p-4 rounded-lg">
                ${message}
            </div>
        </div>
    `;
}

// Loading indicator
function showLoading() {
    if (!stack) return;
    stack.innerHTML = `
        <div class="flex items-center justify-center h-full w-full">
            <div class="loading"></div>
        </div>
    `;
}

async function initializeApp() {
    console.log('Initializing app...');
    showLoading();
    try {
        // First, try to load initial dish
        const response = await fetch('/random-dish');
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.error || 'Failed to load dishes');
        }
        
        if (data.status === 'empty') {
            showError('No more dishes available');
            return;
        }
        
        if (data.status === 'success' && data.dish && data.dish.name) {
            console.log('Successfully loaded initial dish:', data.dish.name);
            currentDish = data.dish;
            renderDish(currentDish);
            // After rendering first dish, start preloading others
            await preloadDishes();
        } else {
            console.error('Invalid dish data received:', data);
            showError('No dishes available');
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize app: ' + error.message);
    }
}

async function preloadDishes() {
    console.log('Starting to preload dishes...');
    const targetCacheSize = 2;
    
    while (dishCache.length < targetCacheSize) {
        try {
            const response = await fetch('/random-dish');
            const data = await response.json();
            
            if (data.status === 'error') {
                console.error('Error preloading dishes:', data.error);
                break;
            }
            
            if (data.status === 'empty') {
                console.log('No more dishes available for caching');
                break;
            }
            
            if (data.status === 'success' && data.dish && data.dish.name) {
                if (!dishCache.some(dish => dish.name === data.dish.name)) {
                    dishCache.push(data.dish);
                    console.log(`Added dish to cache: ${data.dish.name}`);
                } else {
                    console.warn('Received duplicate dish:', data.dish.name);
                }
            } else {
                console.warn('Received invalid dish data');
            }
        } catch (error) {
            console.error('Error during preloading:', error);
            break;
        }
    }
    
    console.log(`Preloading complete. Cache size: ${dishCache.length}`);
}

async function loadNewDish() {
    if (isAnimating) return;
    
    showLoading();
    console.log('Loading new dish...');
    
    try {
        let nextDish = null;
        
        if (dishCache.length > 0) {
            nextDish = dishCache.shift();
            console.log('Loaded dish from cache:', nextDish.name);
        } else {
            const response = await fetch('/random-dish');
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.error || 'Failed to load dish');
            }
            
            if (data.status === 'empty') {
                showError('No more dishes available');
                return;
            }
            
            if (data.status === 'success' && data.dish && data.dish.name) {
                nextDish = data.dish;
                console.log('Loaded dish from server:', nextDish.name);
            } else {
                throw new Error('Invalid dish data received');
            }
        }
        
        if (nextDish && nextDish.name) {
            currentDish = nextDish;
            renderDish(currentDish);
            // Trigger preloading after loading new dish
            preloadDishes();
        } else {
            throw new Error('Invalid dish data received');
        }
    } catch (error) {
        console.error('Error loading new dish:', error);
        showError('Failed to load dish: ' + error.message);
    }
}

function renderDish(dish) {
    console.log('Attempting to render dish:', dish);
    
    if (!dish || !dish.name) {
        console.error('Invalid dish data:', dish);
        showError('Invalid dish data. Please try again.');
        return;
    }
    
    // Clear the stack first
    stack.innerHTML = '';
    
    // Create the card element
    const card = document.createElement('div');
    card.className = 'card absolute bg-white rounded-2xl shadow-xl p-6 w-full h-96 transform transition-transform duration-300';
    card.dataset.dishName = dish.name;
    
    // Ensure all required properties exist
    const dishData = {
        name: dish.name || 'Unknown Dish',
        description: dish.description || 'No description available',
        tags: Array.isArray(dish.tags) ? dish.tags : [],
        spicy: typeof dish.spicy === 'number' ? dish.spicy : 0,
        sweet: typeof dish.sweet === 'number' ? dish.sweet : 0,
        creamy: typeof dish.creamy === 'number' ? dish.creamy : 0
    };
    
    // Create the card content
    card.innerHTML = `
        <div class="relative h-full">
            <h2 class="text-2xl font-bold mb-2">${dishData.name}</h2>
            <p class="text-gray-600 mb-4">${dishData.description}</p>
            <div class="flex flex-wrap gap-2 mb-4">
                ${dishData.tags.map(tag => 
                    `<span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">${tag}</span>`
                ).join('')}
            </div>
            <div class="flavor-bars">
                ${Object.entries({
                    spicy: dishData.spicy,
                    sweet: dishData.sweet,
                    creamy: dishData.creamy
                }).map(([key, val]) => `
                    <div class="mb-2">
                        <div class="flex justify-between text-sm capitalize">
                            <span>${key}</span>
                            <span>${Math.round(val * 100)}%</span>
                        </div>
                        <div class="metric-bar">
                            <div class="metric-value" style="width: ${val*100}%"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Add the card to the stack
    stack.appendChild(card);
    
    // Force a reflow to ensure the card is visible
    card.offsetHeight;
    
    console.log('Dish rendered successfully');
}

function showLoadingPopup(data) {
    const loadingPopup = document.createElement('div');
    loadingPopup.className = 'loading-popup fixed inset-0 flex items-center justify-center bg-black bg-opacity-50';
    loadingPopup.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-lg text-center">
            <div class="loading-animation mb-4"></div>
            <p class="text-lg font-semibold">Analyzing your taste profile...</p>
        </div>
    `;
    document.body.appendChild(loadingPopup);
    setTimeout(() => {
        loadingPopup.remove();
        showAnalysisModal(data);
    }, 3000); // Simulate loading time
}

function showAnalysisModal(data) {
    const modal = document.getElementById('analysis-modal');
    const content = document.getElementById('analysis-content');
    
    if (!data.analysis) {
        // If no analysis is available, just show recommendations
        let html = `
            <div class="mb-6">
                <h3 class="text-xl font-semibold mb-2">Recommended Dishes</h3>
                <div class="space-y-2">
                    ${data.recommendations.map(dish => `
                        <div class="p-3 bg-purple-50 rounded-lg">
                            <div class="font-medium">${dish.name}</div>
                            <div class="text-sm text-gray-600">${dish.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        content.innerHTML = html;
        modal.classList.remove('hidden');
        modal.classList.add('show');
        return;
    }
    
    let foodieTag = `${Math.round(data.analysis.metrics.spicy * 100)}% Indian Spice Lover, ` +
                    `${Math.round(data.analysis.metrics.sweet * 100)}% Sweet Tooth, ` +
                    `${Math.round(data.analysis.metrics.creamy * 100)}% Creamy Connoisseur`;

    let personalizedMessage = `Based on your taste preferences, you seem to enjoy a mix of flavors. We recommend trying dishes that balance these elements.`;

    let html = `
        <div class="mb-6">
            <h3 class="text-xl font-semibold mb-2">Your Foodie Tag</h3>
            <p class="text-gray-700">${foodieTag}</p>
        </div>
        <div class="mb-6">
            <h3 class="text-xl font-semibold mb-2">Analysis</h3>
            <p class="text-gray-700">${data.analysis.analysis}</p>
            <p class="text-gray-700 mt-2">${personalizedMessage}</p>
        </div>
        <div class="mb-6">
            <h3 class="text-xl font-semibold mb-2">Your Taste Metrics</h3>
            ${Object.entries(data.analysis.metrics).map(([key, value]) => `
                <div class="taste-metric">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="capitalize">${key}</span>
                        <span>${Math.round(value * 100)}%</span>
                    </div>
                    <div class="metric-bar">
                        <div class="metric-value" style="width: ${value*100}%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
        <div>
            <h3 class="text-xl font-semibold mb-2">Recommended Dishes</h3>
            <div class="space-y-2">
                ${data.recommendations.map(dish => `
                    <div class="p-3 bg-purple-50 rounded-lg">
                        <div class="font-medium">${dish.name}</div>
                        <div class="text-sm text-gray-600">${dish.description}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

function displayRecommendations(data) {
    const recommendationsElement = document.getElementById('recommendations-section');
    const recommendationsContent = document.getElementById('recommendations-section');
    
    if (!recommendationsElement) {
        console.error('Recommendations section not found');
        return;
    }
    
    // If no recommendations data, use rule-based recommendations
    if (!data || !data.recommendations) {
        // Get liked dishes from the server
        fetch('/profile')
            .then(response => response.json())
            .then(profileData => {
                if (profileData.liked_dishes && profileData.liked_dishes.length > 0) {
                    const likedDishes = profileData.liked_dishes;
                    
                    // Get average preferences
                    const avgSpicy = likedDishes.reduce((sum, dish) => sum + dish.spicy, 0) / likedDishes.length;
                    const avgSweet = likedDishes.reduce((sum, dish) => sum + dish.sweet, 0) / likedDishes.length;
                    const avgCreamy = likedDishes.reduce((sum, dish) => sum + dish.creamy, 0) / likedDishes.length;
                    
                    // Find similar dishes from the recommendations
                    const recommendations = profileData.recommendations || [];
                    
                    let html = `
                        <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
                            <h2 class="text-2xl font-bold mb-4">Recommended Dishes</h2>
                            <div class="space-y-4">
                                ${recommendations.map(dish => `
                                    <div class="p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                                        <div class="font-medium text-lg">${dish.name}</div>
                                        <div class="text-sm text-gray-600">${dish.description}</div>
                                        <div class="mt-2 flex gap-2">
                                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                                Spicy: ${Math.round(dish.spicy * 100)}%
                                            </span>
                                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                                Sweet: ${Math.round(dish.sweet * 100)}%
                                            </span>
                                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                                Creamy: ${Math.round(dish.creamy * 100)}%
                                            </span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                    
                    recommendationsElement.innerHTML = html;
                    recommendationsElement.classList.remove('hidden');
                }
            })
            .catch(error => {
                console.error('Error fetching profile:', error);
                showError('Failed to load recommendations');
            });
        return;
    }
    
    let html = `
        <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 class="text-2xl font-bold mb-4">Recommended Dishes</h2>
            <div class="space-y-4">
                ${data.recommendations.map(dish => `
                    <div class="p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                        <div class="font-medium text-lg">${dish.name}</div>
                        <div class="text-sm text-gray-600">${dish.description}</div>
                        <div class="mt-2 flex gap-2">
                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                Spicy: ${Math.round(dish.spicy * 100)}%
                            </span>
                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                Sweet: ${Math.round(dish.sweet * 100)}%
                            </span>
                            <span class="text-sm bg-purple-200 text-purple-800 px-2 py-1 rounded">
                                Creamy: ${Math.round(dish.creamy * 100)}%
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    recommendationsElement.innerHTML = html;
    recommendationsElement.classList.remove('hidden');
}

function displayAnalysis(analysis) {
    console.log("Displaying analysis:", analysis);
    const analysisSection = document.getElementById('analysis-section');
    if (!analysisSection) {
        console.error("Analysis section not found");
        return;
    }

    // If no analysis data, fetch it from the server
    if (!analysis) {
        fetch('/profile')
            .then(response => response.json())
            .then(profileData => {
                if (profileData.liked_dishes && profileData.liked_dishes.length > 0) {
                    const likedDishes = profileData.liked_dishes;
                    
                    // Calculate basic metrics
                    const avgSpicy = likedDishes.reduce((sum, dish) => sum + dish.spicy, 0) / likedDishes.length;
                    const avgSweet = likedDishes.reduce((sum, dish) => sum + dish.sweet, 0) / likedDishes.length;
                    const avgCreamy = likedDishes.reduce((sum, dish) => sum + dish.creamy, 0) / likedDishes.length;

                    // Determine foodie type
                    let foodieType = "Balanced Foodie";
                    if (avgSpicy > 0.7) foodieType = "Spice Lover";
                    else if (avgSweet > 0.7) foodieType = "Sweet Tooth";
                    else if (avgCreamy > 0.7) foodieType = "Creamy Connoisseur";

                    // Create basic analysis
                    analysis = {
                        analysis: `Based on your preferences, you seem to enjoy ${foodieType.toLowerCase()} dishes. You tend to prefer dishes with ${Math.round(avgSpicy * 100)}% spiciness, ${Math.round(avgSweet * 100)}% sweetness, and ${Math.round(avgCreamy * 100)}% creaminess.`,
                        metrics: {
                            spicy: round(avgSpicy, 2),
                            sweet: round(avgSweet, 2),
                            creamy: round(avgCreamy, 2)
                        },
                        foodie_type: foodieType
                    };
                } else {
                    analysisSection.innerHTML = '<p class="text-gray-500">No analysis available yet. Like more dishes to get your taste profile!</p>';
                    return;
                }
            })
            .catch(error => {
                console.error('Error fetching profile:', error);
                analysisSection.innerHTML = '<p class="text-red-500">Error loading analysis. Please try again.</p>';
                return;
            });
    }

    if (!analysis) {
        analysisSection.innerHTML = '<p class="text-gray-500">No analysis available yet. Like more dishes to get your taste profile!</p>';
        return;
    }

    try {
        const analysisHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h2 class="text-2xl font-bold mb-4">Your Taste Profile</h2>
                <div class="mb-4">
                    <p class="text-gray-700">${analysis.analysis}</p>
                </div>
                <div class="grid grid-cols-3 gap-4 mb-4">
                    <div class="text-center">
                        <div class="text-sm text-gray-600">Spicy</div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div class="bg-red-600 h-2.5 rounded-full" style="width: ${analysis.metrics.spicy * 100}%"></div>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-sm text-gray-600">Sweet</div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div class="bg-yellow-400 h-2.5 rounded-full" style="width: ${analysis.metrics.sweet * 100}%"></div>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="text-sm text-gray-600">Creamy</div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5">
                            <div class="bg-blue-500 h-2.5 rounded-full" style="width: ${analysis.metrics.creamy * 100}%"></div>
                        </div>
                    </div>
                </div>
                <div class="mt-4">
                    <span class="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                        ${analysis.foodie_type}
                    </span>
                </div>
            </div>
        `;

        analysisSection.innerHTML = analysisHTML;
        console.log("Analysis displayed successfully");
    } catch (error) {
        console.error("Error displaying analysis:", error);
        analysisSection.innerHTML = '<p class="text-red-500">Error displaying analysis. Please try again.</p>';
    }
}

// Update the handleSwipe function to ensure analysis is displayed
function handleSwipe(direction) {
    const card = document.querySelector('.card');
    if (!card) return;

    const liked = direction === 'right';
    const dishName = card.dataset.dishName;
    
    if (liked) {
        fetch(`/like/${dishName}`)
            .then(response => response.json())
            .then(data => {
                console.log("Like response:", data);
                if (data.status === "success") {
                    // Update recommendations if available
                    if (data.recommendations) {
                        displayRecommendations(data.recommendations);
                    }
                    // Update analysis if available
                    if (data.analysis) {
                        displayAnalysis(data.analysis);
                    }
                }
            })
            .catch(error => console.error("Error liking dish:", error));
    }

    // Animate card
    card.style.transform = `translateX(${direction === 'right' ? '100%' : '-100%'})`;
    card.style.opacity = '0';
    
    setTimeout(() => {
        card.remove();
        loadNewDish();
    }, 300);
}

function closeModal() {
    const modal = document.getElementById('analysis-modal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
}

// Swipe handlers
hammer.on('swipeleft', () => handleSwipe('left'));
hammer.on('swiperight', () => handleSwipe('right'));

// Button handlers
if (likeButton) {
    likeButton.addEventListener('click', () => handleSwipe('right'));
}

if (dislikeButton) {
    dislikeButton.addEventListener('click', () => handleSwipe('left'));
}

const analysisModal = document.getElementById('analysis-modal');
if (analysisModal) {
    analysisModal.addEventListener('click', (e) => {
        if (e.target.id === 'analysis-modal') {
            closeModal();
        }
    });
}

// Add reset button to the UI
function addResetButton() {
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-session';
    resetButton.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-600 transition-colors';
    resetButton.textContent = 'Reset Session';
    resetButton.onclick = resetSession;
    document.body.appendChild(resetButton);
}

async function resetSession() {
    try {
        const response = await fetch('/reset-session');
        const data = await response.json();
        if (data.status === 'success') {
            // Reload the page to start fresh
            window.location.reload();
        }
    } catch (error) {
        console.error('Error resetting session:', error);
        showError('Failed to reset session');
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    addResetButton();
    initializeApp();
});

// Add CSS styles for smoother animations
const style = document.createElement('style');
style.textContent = `
    #card-stack {
        position: relative;
        width: 100%;
        height: 400px;
        margin: 0 auto;
        perspective: 1000px;
        touch-action: pan-y pinch-zoom;
    }
    
    .card {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        backface-visibility: hidden;
        transform-origin: center;
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform;
        touch-action: pan-y pinch-zoom;
    }
    
    .swipe-left {
        transform: translateX(-150%) rotate(-30deg) scale(0.8);
        opacity: 0;
    }
    
    .swipe-right {
        transform: translateX(150%) rotate(30deg) scale(0.8);
        opacity: 0;
    }
    
    .metric-bar {
        width: 100%;
        height: 8px;
        background-color: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
    }
    
    .metric-value {
        height: 100%;
        background-color: #8b5cf6;
        transition: width 0.3s ease-out;
    }
    
    .loading {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #8b5cf6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

function initializeHammer(element) {
    const hammer = new Hammer(element);
    
    // Configure Hammer.js
    hammer.get('swipe').set({ direction: Hammer.DIRECTION_ALL });
    hammer.get('swipe').set({ threshold: 5, velocity: 0.3 });
    
    // Add swipe event listeners
    hammer.on('swipeleft', () => handleSwipe('left'));
    hammer.on('swiperight', () => handleSwipe('right'));
    
    return hammer;
} 