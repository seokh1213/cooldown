#!/usr/bin/env python3
"""
포로 로고를 파비콘으로 변환하는 스크립트
"""
from PIL import Image
import os

def create_favicon(input_path: str, output_dir: str = "public"):
    """포로 로고를 다양한 크기의 파비콘으로 생성"""
    if not os.path.exists(input_path):
        print(f"Error: {input_path} 파일을 찾을 수 없습니다.")
        return
    
    # 출력 디렉토리 생성
    os.makedirs(output_dir, exist_ok=True)
    
    # 원본 이미지 로드
    img = Image.open(input_path)
    
    # 투명도가 있는 경우 RGBA 모드로 변환
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # 다양한 크기의 파비콘 생성
    sizes = [
        (16, 16, 'favicon-16x16.png'),
        (32, 32, 'favicon-32x32.png'),
        (48, 48, 'favicon-48x48.png'),
        (180, 180, 'apple-touch-icon.png'),  # Apple touch icon
    ]
    
    for width, height, filename in sizes:
        resized = img.resize((width, height), Image.Resampling.LANCZOS)
        output_path = os.path.join(output_dir, filename)
        # 투명도 보존하며 저장
        resized.save(output_path, 'PNG', compress_level=9)
        print(f"✓ {filename} 생성 완료 ({width}x{height})")
    
    # ICO 파일 생성 (16x16, 32x32 포함)
    ico_sizes = [(16, 16), (32, 32)]
    ico_images = []
    for width, height in ico_sizes:
        resized = img.resize((width, height), Image.Resampling.LANCZOS)
        ico_images.append(resized)
    
    ico_path = os.path.join(output_dir, 'favicon.ico')
    ico_images[0].save(ico_path, format='ICO', sizes=ico_sizes)
    print(f"✓ favicon.ico 생성 완료")
    
    print(f"\n모든 파비콘이 {output_dir} 폴더에 생성되었습니다!")

if __name__ == "__main__":
    create_favicon("poro_logo.png", "public")

