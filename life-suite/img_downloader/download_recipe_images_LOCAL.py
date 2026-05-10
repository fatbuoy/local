#!/usr/bin/env python3
"""
Recipe Image Downloader
Run this script locally where you have your recipes-source.csv file

Usage:
    python3 download_recipe_images.py

This script will:
1. Read your CSV file
2. Find recipes without Image URLs
3. Search for images on the web
4. Download them with the dish name as filename

Requirements:
    pip install requests pillow beautifulsoup4

"""

import csv
import os
import requests
import sys
from pathlib import Path
from urllib.parse import quote
import time
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    print("⚠️  PIL not found. Install it with: pip install pillow")
    Image = None

def sanitize_filename(name):
    """Convert dish name to valid filename"""
    invalid_chars = r'<>:"|?*\/'
    for char in invalid_chars:
        name = name.replace(char, '')
    name = name.replace(' ', '_')
    name = '_'.join(name.split('_'))
    return name[:100].strip('_')

def search_google_images(dish_name, cuisine):
    """Try to get image URL from Google Images search"""
    try:
        # Using a simple Bing image URL that works without auth
        query = f"{dish_name} {cuisine}"
        # DuckDuckGo image proxy endpoint (works without API key)
        url = f"https://api.duckduckgo.com/?q={quote(query)}&format=json&iax=images&ia=images"
        
        resp = requests.get(url, timeout=5)
        data = resp.json()
        
        if data.get('results'):
            for result in data.get('results', []):
                img_url = result.get('image')
                if img_url:
                    return img_url
        return None
    except Exception as e:
        return None

def download_image_file(image_url, filename, output_dir):
    """Download and save image file"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        resp = requests.get(image_url, headers=headers, timeout=10)
        resp.raise_for_status()
        
        # Determine extension from content-type
        content_type = resp.headers.get('content-type', 'image/jpeg').lower()
        if 'png' in content_type:
            ext = 'png'
        elif 'gif' in content_type:
            ext = 'gif'
        elif 'webp' in content_type:
            ext = 'webp'
        else:
            ext = 'jpg'
        
        filepath = output_dir / f"{filename}.{ext}"
        
        # Save the image
        with open(filepath, 'wb') as f:
            f.write(resp.content)
        
        return str(filepath)
        
    except Exception as e:
        return None

def main():
    # Setup
    csv_file = Path('recipes-source.csv')
    output_dir = Path('downloaded_recipe_images')
    
    if not csv_file.exists():
        print(f"❌ {csv_file} not found in current directory!")
        print(f"   Please place this script in the same folder as your CSV file")
        return
    
    output_dir.mkdir(exist_ok=True)
    
    # Read CSV
    print(f"📖 Reading {csv_file}...")
    
    recipes_missing_images = []
    try:
        with open(csv_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                image_url = row.get('Image URL', '').strip()
                if not image_url:
                    recipes_missing_images.append({
                        'name': row.get('Dish Name', '').strip(),
                        'cuisine': row.get('Cuisine', '').strip(),
                    })
    except Exception as e:
        print(f"❌ Error reading CSV: {e}")
        return
    
    total = len(recipes_missing_images)
    
    if total == 0:
        print("✅ All recipes have image URLs!")
        return
    
    print(f"\n🖼️  Found {total} recipes without images")
    print(f"📁 Output directory: {output_dir.absolute()}\n")
    
    success_count = 0
    failed_count = 0
    
    for idx, recipe in enumerate(recipes_missing_images, 1):
        dish_name = recipe['name']
        cuisine = recipe['cuisine']
        
        if not dish_name:
            continue
        
        # Show progress
        pct = (idx / total) * 100
        print(f"[{idx:3d}/{total}] {dish_name[:45]:45s}", end=' ', flush=True)
        
        # Search for image
        image_url = search_google_images(dish_name, cuisine)
        
        if not image_url:
            print("⚠️  No image found")
            failed_count += 1
            time.sleep(0.3)
            continue
        
        # Download image
        safe_filename = sanitize_filename(dish_name)
        filepath = download_image_file(image_url, safe_filename, output_dir)
        
        if filepath:
            print("✅")
            success_count += 1
        else:
            print("❌")
            failed_count += 1
        
        time.sleep(0.5)  # Be nice to servers
    
    # Summary
    print(f"\n{'='*70}")
    print(f"✅ Successfully downloaded: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"📁 Saved to: {output_dir.absolute()}")
    print(f"{'='*70}")
    
    print(f"\nFiles are named after the dish, e.g.:")
    print(f"  • basic_breakfast_porridge.jpg")
    print(f"  • paneer_bhurji.png")
    print(f"  • negroni.jpg")

if __name__ == '__main__':
    main()
