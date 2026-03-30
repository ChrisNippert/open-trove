# Idea/Summary
This web app would be used to categorize items stored with images, metadata that is in a user defined heirarchical structure, such as the following example:
[
    product info: name, cost, category, date 
    pricing info: source, second-hand, purchase price, original price, msrp
    tags: season, visibility, custom
]

This should be searchable, and also have a couple main sections. Items can be categorized in "Groups". This could be whatever the user would like, like Bedroom Closet, DND Dice, or Pantry Items.
Within these groups, there is a user defined structure and item schema or something like that

Json config:
```json
[
    "Clothing": {
        "ItemSchemas": {
            "ClothingItem": {
                "product info": {
                    "name": {
                        "type": "string",
                        "required": true,
                        },
                    "image": {
                        "type": "image"
                    }
                    "category": {
                        "type": "dropdown",
                        "dropdown-items": [
                            "bottoms",
                            "tops",
                            "socks",
                            "accessories",
                        ],
                    },
                    "color": {
                        "type": "string",
                    },
                    "date": {
                        "type": "datetime",
                    },
                    "Season": {
                        "type": "multiselect",
                        "multiselect-items": [
                            "Sprint",
                            "Summer",
                            "Fall",
                            "Winter",
                        ],
                    },
                },
                "pricing info": {
                    "source": {
                        "type": "string"
                    },
                    "second-hand": {
                        "type": "boolean"
                    },
                    "purchase price" {
                        "type": "float"
                    },
                    "original price" {
                        "type": "float"
                    },
                    "msrp": {
                        "type": "float"
                    },
                },
                "tags": [
                    "#japantrip", "#ishitmypants", "#extracozyfavorites"
                ]
            }
        },
        "DirectoryStructure": {
            "Items": {
                "type": "Item"
            },
            "Outfits": {
                "Season": {
                    "Spring" {
                        "type": "Item[]"
                    },
                    "Summer" {
                        "type": "Item[]"
                    },
                    "Fall" {
                        "type": "Item[]"
                    },
                    "Winter" {
                        "type": "Item[]"
                    },
                }
                "type": "Item[]"
            },
        }
    },

    "Fridge": {
        "ItemSchemas": {
            "FoodItem": {
                "product info": {
                    "name": {
                        "type": "string",
                        "required": true,
                    },
                    "type": {
                        "type": "string",
                    },
                    "brand": {
                        "type": "string",
                    },
                    "image": {
                        "type": "image"
                    },
                    "count": {
                        "type": "int"
                    },
                    "amount": { // like how many grams, floz, etc...
                        "type": "string"
                    },
                    "price": {
                        "type": "float"
                    },
                    "dateAcquired": {
                        "type": "datetime",
                    },
                    "expiration Date": {
                        "type": "datetime",
                    },
                },
            }
        },
        "DirectoryStructure": {
            "Items": {
                "type": "Item"
            },
        }
    },

    "Basement": {
        "ItemSchemas": {
            "Supply": {
                "name":{
                    "type": "string",
                    "required": true
                },
                "expiration":{
                    "type": "datetime"
                },
                "units":{
                    "type": "int"
                },
                "items per unit":{
                    "type": "int"
                },
                "total items":{
                    "type": "int"
                },
                "brand":{
                    "type": "string"
                },
                "cost":{
                    "type": "float"
                },
                "weight":{
                    "type": "unit" // secretly a string probably
                },
                "notes":{
                    "type": "string"
                },
                "generic name":{
                    "type": "dropdown"
                },
                "category":{
                    "type": "dropdown"
                },
                "group":{
                    "type": "dropdown"
                },
                "purchased":{
                    "type": "datetime"
                },
                "purchased from":{
                        "type": "string"
                },
                "storage location":{
                        "type": "dropdown"
                },
            }
        },
        "DirectoryStructure":{
            "Items": {
                "type": "Item"
            },
            "Supplies": {
                "Firts Aid": {
                    "Bandaids": {
                        "type": "Item"
                    },
                    "Disinfectant": {
                        "type": "Item"
                    },
                    "Medication": {
                        "type": "Item"
                    },
                    "items": [ // some special array type name that stores items
                        
                    ]
                },
                "items": [ // some special array type name that stores items?
                    
                ]
            },
            "Foods":{
                "type": "Food"
            }
        },
    }
]
```

The schemas provided, especially the Basement are a little not standardized because of some of the following, so this is still up for debate.

Ease of use for adding, removing, and updating

Possibly different views like tables and such

Somehow needs to be able to link different item fields to modify others?

Not sure how to keep track of heirarchical things relations such as First Aid -> Bandaids -> "Specific Bandaid", but also things that are multi select like outfit has a field for season, which can have "spring" and "summer". Thought about doing something like a directory file structure and storing that way but users might find it more helpful to have dropdown menu type stuff for that. Thoughts?

In terms of storage, things like Clothing Item and Pricing Info are more for UI organization than actual data storage, so when storing these, probably just use a csv/one table sql table where each field is it's own column.

Not sure how to handle fields that have multiple variables, like things that cost money need money units. Yeah i guess units that can differ by item.

# Language
Python backend for API and Data storage using sqlite and maybe flask for the http api? Unless there is another language that is more capable.
Front end in Vite React

# UI Requirements
Usable on Web Desktop and Web Phone

Things the user would want to do:
* View all items in a big list like a table or Grid of images
* Have a search thats not slow
* Add, update, and remove items
* Allow user to create and modify group schemas
* Allow images to be take on the platform if a camera is found (very important for phones), also choose file
* Export data as csv/json
* Import data as csv/json (checking for the right format)
* Look like a modern user friendly application but not tech nerd types stuff. More like squarespace funny online store vibes, but looks usable.

## UI Cool things that are probably hard or for later
* Graph display for changes over time when using datetime fields. Some kinda powerbi type thing where you can drag and drop fields on x and y axes and see what it looks like. Pie graphs, line charts, scatter plots, you get the idea.
* Use Local LM for custom data querying for things like recipe options, outfits that look good, things like that. Omnimodal because images and such.
* URL and webscrape to autofill data into an item. Review for item adding to the collection.